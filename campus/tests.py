import asyncio
from contextlib import asynccontextmanager
from unittest.mock import patch

from channels.db import database_sync_to_async
from channels.testing import WebsocketCommunicator
from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import Client, TransactionTestCase, override_settings

from accounts.models import Profile
from config.asgi import application
from . import consumers


@override_settings(ALLOWED_HOSTS=["127.0.0.1", "localhost", "testserver"], DEBUG=False)
class CampusSocketTests(TransactionTestCase):
    def setUp(self):
        consumers.room = consumers.CampusRoom()
        self.alice = get_user_model().objects.create_user(username="alice", password="Test!River4820")
        self.bob = get_user_model().objects.create_user(username="bob", password="Test!River4820")
        Profile.objects.create(user=self.alice, nickname="조원 하나")
        Profile.objects.create(user=self.bob, nickname="조원 둘")
        self.a, self.b = Client(), Client()
        self.a.force_login(self.alice)
        self.b.force_login(self.bob)

    def socket(self, client=None, origin="http://127.0.0.1"):
        headers = [(b"origin", origin.encode()), (b"host", b"127.0.0.1")]
        if client:
            cookie = client.cookies[settings.SESSION_COOKIE_NAME].value
            headers.append((b"cookie", f"{settings.SESSION_COOKIE_NAME}={cookie}".encode()))
        return WebsocketCommunicator(application, "/ws/campus/", headers=headers)

    @asynccontextmanager
    async def connections(self, *clients):
        sockets = []
        try:
            for client in clients:
                ws = self.socket(client)
                sockets.append(ws)
                connected, _ = await ws.connect()
                self.assertTrue(connected)
            yield sockets
        finally:
            for ws in reversed(sockets):
                await ws.disconnect()
        self.assertFalse(consumers.room.players)

    async def welcome_pair(self, a, b):
        first = await a.receive_json_from()
        second = await b.receive_json_from()
        join = await a.receive_json_from()
        self.assertEqual(join["type"], "join")
        return first, second

    def movement(self, **changes):
        return {"type": "move", "x": 1250.125, "y": 442.875,
                "dir": "left", "color": "#4e9b91", "moving": True, **changes}

    async def test_anonymous_and_foreign_origin_connections_are_rejected(self):
        for client, origin in [(None, "http://127.0.0.1"), (self.a, "https://untrusted.example")]:
            ws = self.socket(client, origin)
            try:
                connected, _ = await ws.connect()
                self.assertFalse(connected)
                self.assertFalse(consumers.room.players)
            finally:
                await ws.disconnect()

    async def test_join_snapshot_and_fractional_movement_use_server_identity(self):
        async with self.connections(self.a, self.b) as (a, b):
            first, second = await self.welcome_pair(a, b)
            self.assertEqual(len(first["players"]), 1)
            self.assertEqual(len(second["players"]), 2)
            self.assertEqual({p["nickname"] for p in second["players"]}, {"조원 하나", "조원 둘"})
            await a.send_json_to(self.movement(id=second["selfId"], nickname="사칭한 이름"))
            message = await b.receive_json_from()
            self.assertEqual(message["type"], "move")
            self.assertEqual(message["player"]["id"], first["selfId"])
            self.assertEqual(message["player"]["nickname"], "조원 하나")
            self.assertEqual(message["player"]["x"], 1250.125)
            self.assertEqual(message["player"]["y"], 442.875)
            self.assertEqual(message["player"]["color"], "#4e9b91")
            self.assertTrue(await a.receive_nothing())

    async def test_invalid_positions_and_fields_do_not_broadcast_or_crash(self):
        async with self.connections(self.a, self.b) as (a, b):
            await self.welcome_pair(a, b)
            for changes in [{"x": -1}, {"y": 10000}, {"x": float("nan")}, {"x": 10 ** 350},
                            {"x": True}, {"dir": []}, {"color": {}}, {"moving": "yes"}]:
                await a.send_json_to(self.movement(**changes))
            self.assertTrue(await b.receive_nothing())
            await a.send_json_to(self.movement())
            self.assertEqual((await b.receive_json_from())["type"], "move")

    async def test_stopping_and_room_teleport_are_broadcast(self):
        async with self.connections(self.a, self.b) as (a, b):
            await self.welcome_pair(a, b)
            await a.send_json_to(self.movement())
            await b.receive_json_from()
            await asyncio.sleep(0.05)
            await a.send_json_to(self.movement(x=365.25, y=380.5, moving=False))
            peer = (await b.receive_json_from())["player"]
            self.assertFalse(peer["moving"])
            self.assertEqual((peer["x"], peer["y"]), (365.25, 380.5))

    async def test_disconnect_removes_avatar_and_later_connection_has_no_ghost(self):
        async with self.connections(self.a, self.b) as (a, b):
            first, _ = await self.welcome_pair(a, b)
            await a.disconnect()
            self.assertEqual(await b.receive_json_from(), {"type": "leave", "id": first["selfId"]})
            reconnect = self.socket(self.a)
            try:
                self.assertTrue((await reconnect.connect())[0])
                new = await reconnect.receive_json_from()
                self.assertEqual(len(new["players"]), 2)
                self.assertNotIn(first["selfId"], {p["id"] for p in new["players"]})
            finally:
                await reconnect.disconnect()

    async def test_two_tabs_of_same_account_have_independent_presence(self):
        async with self.connections(self.a, self.a) as (a, b):
            first, second = await self.welcome_pair(a, b)
            self.assertNotEqual(first["selfId"], second["selfId"])
            self.assertEqual({p["nickname"] for p in second["players"]}, {"조원 하나"})

    async def test_logout_in_another_tab_revokes_socket_and_announces_leave(self):
        with patch.object(consumers.CampusConsumer, "session_check_interval", 0.05):
            async with self.connections(self.a, self.b) as (a, b):
                first, _ = await self.welcome_pair(a, b)
                await database_sync_to_async(self.a.logout)()
                close = await a.receive_output(timeout=2)
                self.assertEqual(close, {"type": "websocket.close", "code": 4401})
                self.assertEqual(await b.receive_json_from(), {"type": "leave", "id": first["selfId"]})

    async def test_nickname_change_is_published_to_existing_connections(self):
        with patch.object(consumers.CampusConsumer, "session_check_interval", 0.05):
            async with self.connections(self.a, self.b) as (a, b):
                await self.welcome_pair(a, b)
                await database_sync_to_async(Profile.objects.filter(user=self.alice).update)(nickname="새 이름")
                self.assertEqual((await b.receive_json_from(timeout=2))["player"]["nickname"], "새 이름")

    async def test_oversized_and_malformed_payloads_close_without_ghosts(self):
        for payload, code in [("{" + "x" * 513, 1009), ("not-json", 1007)]:
            async with self.connections(self.a) as (a,):
                await a.receive_json_from()
                await a.send_to(text_data=payload)
                self.assertEqual((await a.receive_output())["code"], code)
                self.assertFalse(consumers.room.players)

    async def test_heartbeat_keeps_idle_clients_connected_and_rate_limits_movement(self):
        async with self.connections(self.a, self.b) as (a, b):
            await self.welcome_pair(a, b)
            await a.send_json_to({"type": "ping"})
            self.assertEqual(await a.receive_json_from(), {"type": "pong"})
            for i in range(30):
                await a.send_json_to(self.movement(x=1250 + i))
            self.assertEqual((await b.receive_json_from())["type"], "move")
            self.assertTrue(await b.receive_nothing())
