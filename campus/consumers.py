"""Authenticated presence for the single-process local campus prototype."""
import asyncio
from contextlib import suppress
from importlib import import_module
import json
import math
import time
from types import SimpleNamespace
from uuid import uuid4

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.conf import settings
from django.contrib.auth import get_user

from accounts.models import get_nickname


class CampusRoom:
    group = "campus.main"

    def __init__(self):
        self.players = {}
        self.lock = asyncio.Lock()


room = CampusRoom()


class CampusConsumer(AsyncWebsocketConsumer):
    session_check_interval = 10
    idle_timeout = 60
    colors = {"#dfa34d", "#4e9b91", "#8a78bb", "#cb7773", "#648eb5"}
    directions = {"up", "down", "left", "right"}

    async def connect(self):
        self.player_id = None
        self.guard_task = None
        self.user = self.scope["user"]
        if not self.user.is_authenticated or not self.user.is_active:
            await self.close(code=4401)
            return
        self.session_key = self.scope["session"].session_key
        self.player_id = uuid4().hex
        self.last_seen = time.monotonic()
        self.last_move = 0
        nickname = await database_sync_to_async(get_nickname)(self.user)
        self.state = {
            "id": self.player_id, "nickname": nickname,
            "x": 1262.0, "y": 437.0, "dir": "down", "color": "#dfa34d", "moving": False,
        }
        async with room.lock:
            await self.channel_layer.group_add(room.group, self.channel_name)
            room.players[self.player_id] = self.state.copy()
            await self.accept()
            await self.send_packet({"type": "welcome", "selfId": self.player_id, "players": list(room.players.values())})
            await self.broadcast({"type": "join", "player": self.state.copy()})
        self.guard_task = asyncio.create_task(self.check_session_loop())

    async def receive(self, text_data=None, bytes_data=None):
        if not self.player_id or self.player_id not in room.players:
            return
        if text_data is None or len(text_data) > 512:
            await self.leave()
            await self.close(code=1009)
            return
        try:
            data = json.loads(text_data)
        except (ValueError, RecursionError):
            await self.leave()
            await self.close(code=1007)
            return
        if not isinstance(data, dict):
            return
        if data.get("type") == "ping":
            self.last_seen = time.monotonic()
            await self.send_packet({"type": "pong"})
            return
        if data.get("type") != "move":
            return
        x, y = data.get("x"), data.get("y")
        if (type(x) not in (int, float) or type(y) not in (int, float)
                or not 0 <= x <= 1632 or not 0 <= y <= 820
                or not math.isfinite(x) or not math.isfinite(y)
                or type(data.get("dir")) is not str or type(data.get("color")) is not str
                or data.get("dir") not in self.directions
                or data.get("color") not in self.colors or type(data.get("moving")) is not bool):
            return
        now = time.monotonic()
        self.last_seen = now
        if now - self.last_move < 0.045:
            return
        self.last_move = now
        # Identity is always taken from the session, never from the message.
        self.state.update(x=float(x), y=float(y), dir=data["dir"], color=data["color"], moving=data["moving"])
        async with room.lock:
            if self.player_id in room.players:
                room.players[self.player_id] = self.state.copy()
                await self.broadcast({"type": "move", "player": self.state.copy()})

    async def send_packet(self, payload):
        await self.send(text_data=json.dumps(payload, ensure_ascii=False, allow_nan=False))

    async def broadcast(self, payload):
        await self.channel_layer.group_send(room.group, {
            "type": "presence.packet", "sender": self.player_id, "payload": payload,
        })

    async def presence_packet(self, event):
        if self.player_id in room.players and event["sender"] != self.player_id:
            await self.send_packet(event["payload"])

    @database_sync_to_async
    def current_nickname(self):
        # A fresh session store catches logout/password changes in another tab.
        store = import_module(settings.SESSION_ENGINE).SessionStore(session_key=self.session_key)
        user = get_user(SimpleNamespace(session=store))
        if not user.is_authenticated or user.pk != self.user.pk:
            return None
        return get_nickname(user)

    async def check_session_loop(self):
        while True:
            await asyncio.sleep(self.session_check_interval)
            await self.channel_layer.send(self.channel_name, {"type": "presence.check"})

    async def presence_check(self, event):
        if self.player_id not in room.players:
            return
        nickname = await self.current_nickname()
        if nickname is None or time.monotonic() - self.last_seen > self.idle_timeout:
            await self.leave()
            await self.close(code=4401 if nickname is None else 4408)
            return
        if nickname != self.state["nickname"]:
            self.state["nickname"] = nickname
            async with room.lock:
                room.players[self.player_id] = self.state.copy()
                await self.broadcast({"type": "move", "player": self.state.copy()})

    async def leave(self):
        async with room.lock:
            if self.player_id and room.players.pop(self.player_id, None) is not None:
                await self.channel_layer.group_discard(room.group, self.channel_name)
                await self.broadcast({"type": "leave", "id": self.player_id})

    async def disconnect(self, close_code):
        if self.guard_task:
            self.guard_task.cancel()
            with suppress(asyncio.CancelledError):
                await self.guard_task
        await self.leave()
