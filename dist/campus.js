(() => {
  'use strict';
  const D=window.CampusData, $=id=>document.getElementById(id);
  const canvas=$('mapCanvas'), ctx=canvas.getContext('2d'), mini=$('minimap'), mctx=mini.getContext('2d');
  const viewport=$('viewport'), dialog=$('detailDialog'), boardDialog=$('boardDialog'), exitDialog=$('exitDialog'), logoutForm=$('campusLogoutForm');
  const boardCards=[...boardDialog.querySelectorAll('[data-board-choice]')];
  let menuRequest=null,menuVersion=0;
  const isDialogOpen=()=>dialog.open||boardDialog.open||exitDialog.open;
  const scene=document.createElement('canvas');scene.width=D.width*2;scene.height=D.height*2;
  const g=scene.getContext('2d');g.scale(2,2);
  const font='"Malgun Gothic", "Noto Sans KR", system-ui, sans-serif';
  const spawn=D.rooms.find(r=>r.id==='lounge1').target;
  const camera={x:0,y:0,zoom:1,fit:1,follow:false}, player={x:spawn[0],y:spawn[1],dir:'down',color:'#dfa34d',moving:false,step:0};
  let exitReturnPoint={x:spawn[0],y:spawn[1]}, logoutPending=false;
  let vw=0,vh=0,dpr=1,path=[],nearby=null,hover=null,lastRoom='',lastTime=0,toastTimer,selectedRoom=null;
  const keys=new Set(), touchKeys=new Set();
  const presence=window.CampusPresence?.create({player,width:D.width,height:D.height,onAuthExpired(){path=[];keys.clear();touchKeys.clear();player.moving=false;}})||{peers:new Map(),tick(){},close(){}};
  const floorTypes=new Set(['rug','floor-arrow','woodwall']);
  const accessoryTypes=new Set(['monitor','laptop','notebook']);
  const glassTypes=new Set(['glass-wall','sliding-door']);
  const solidTypes=new Set(['desk','bar','counter','water','coffee-machine','printer','bin','pillar','bookshelf','bookshelf-side','sofa','bench','coffee','roundtable','ottoman','cabinet','box','tv','plant','fire-extinguisher','noticeboard','stool','woodwall','glass-wall']);
  const noticeboards=D.objects.filter(o=>o.type==='noticeboard');
  const rr=(x,y,w,h,color,r=0,stroke=null)=>{g.beginPath();g.roundRect(x,y,w,h,Math.min(r,w/2,h/2));g.fillStyle=color;g.fill();if(stroke){g.strokeStyle=stroke;g.lineWidth=1;g.stroke();}};
  const line=(x1,y1,x2,y2,color,width=1)=>{g.beginPath();g.moveTo(x1,y1);g.lineTo(x2,y2);g.strokeStyle=color;g.lineWidth=width;g.stroke();};
  const ellipse=(x,y,rx,ry,color)=>{g.beginPath();g.ellipse(x,y,rx,ry,0,0,Math.PI*2);g.fillStyle=color;g.fill();};
  function text(str,x,y,size=12,color='#586f68',weight=600,align='center'){g.font=`${weight} ${size}px ${font}`;g.fillStyle=color;g.textAlign=align;g.textBaseline='middle';g.fillText(str,x,y);}
  function floor(r){
    const colors={wood:'#e2cda9',class:'#e8e9df',hall:'#f0eee5',office:'#e1e4e2',meeting:'#e3d3b8',stone:'#d9deda',orange:'#f7dfc8',yellow:'#fff0b3'};
    rr(r.x,r.y,r.w,r.h,colors[r.floor]||'#e8e8df');
    g.save();g.beginPath();g.rect(r.x,r.y,r.w,r.h);g.clip();
    if(['wood','meeting','orange','yellow'].includes(r.floor)){
      for(let y=r.y;y<r.y+r.h;y+=15){line(r.x,y,r.x+r.w,y,'#bea97a35');line(r.x,y+1,r.x+r.w,y+1,'#fff8e539');let shift=(Math.round((y-r.y)/15)%3)*21;for(let x=r.x+shift;x<r.x+r.w;x+=71)line(x,y,x,y+15,'#bca0752b');}
    }else{
      const tile=r.floor==='hall'?32:25;
      for(let y=r.y;y<r.y+r.h;y+=tile)line(r.x,y,r.x+r.w,y,'#87988b20');
      for(let x=r.x;x<r.x+r.w;x+=tile)line(x,r.y,x,r.y+r.h,'#87988b20');
    }
    if(r.floor==='yellow')rr(r.x+3,r.y+4,r.w-6,7,'#eed051');
    if(r.floor==='orange')rr(r.x+3,r.y+4,r.w-6,7,'#e49762');
    g.restore();
  }
  function furniture(o){
    const {x,y,w,h,type}=o,c=o.color;
    if(type==='rug'){rr(x,y,w,h,c,5);rr(x+4,y+4,w-8,h-8,'#ffffff10',3,'#fff8e439');return;}
    if(type==='floor-arrow'){g.save();g.globalAlpha=.24;line(x,y+h/2,x+w,y+h/2,'#82988a',2);line(x+w-6,y+2,x+w,y+h/2,'#82988a',2);line(x+w-6,y+h-2,x+w,y+h/2,'#82988a',2);g.restore();return;}
    if(type==='woodwall'){
      rr(x,y,w,h,'#a9875a');
      if(h>w){for(let i=0;i<h;i+=8)line(x+1,y+i,x+w-1,y+i,'#dcc09655');line(x+w-1,y,x+w-1,y+h,'#816340',2);g.save();g.translate(x+w/2,y+h/2);g.rotate(-Math.PI/2);text('PLAYDATA',0,0,8,'#fff5dc',800);g.restore();}
      else{for(let i=0;i<w;i+=8)line(x+i,y+1,x+i,y+h,'#b4946622');text('PLAYDATA',x+51,y-9,13,'#167d79',800);}return;
    }
    if(type==='glass-wall'){
      if(o.orientation==='horizontal'){
        rr(x,y-5,w,8,'#7abfc448',1,'#85afb0');line(x+1,y-3,x+w-1,y-3,'#f7fffeaa',1);
        for(let xx=x+10;xx<x+w-5;xx+=15)line(xx,y+1,xx+5,y-3,'#f9ffffd9',1.5);
        rr(x,y-6,3,10,'#789d98',1);rr(x+w-3,y-6,3,10,'#789d98',1);return;
      }
      rr(x-2,y-4,w+5,h,'#7abfc448',1,'#85afb0');line(x+1,y-3,x+1,y+h-5,'#f7fffeaa',1);for(let yy=y+12;yy<y+h-10;yy+=28)line(x-3,yy+7,x+5,yy,'#f9ffffd9',1.5);rr(x-3,y-6,w+7,3,'#789d98',1);rr(x-3,y+h-4,w+7,3,'#789d98',1);return;
    }
    if(type==='sliding-door'){
      if(o.orientation==='horizontal'){
        line(x-28,y,x+w+25,y,'#729b9c',1);line(x-28,y+11,x+w+25,y+11,'#a0c5bf',1);
        rr(x-24,y+2,23,7,'#8bcbd355',1,'#749e9d');line(x-21,y+3,x-4,y+3,'#ffffffaa',1);line(x-5,y+4,x-5,y+8,'#537e77',2);
        line(x+w/2,y+16,x+w/2,y+28,'#5f958a80',1);line(x+w/2,y+16,x+w/2-3,y+20,'#5f958a80',1);line(x+w/2,y+16,x+w/2+3,y+20,'#5f958a80',1);return;
      }
      // The sliding leaf is parked over the fixed pane, leaving the doorway open.
      line(x+6,y,x+6,y+h,'#8dbeb640',1);line(x+11,y,x+11,y+h,'#b0d8cf40',1);
      rr(x+8,y-48,5,46,'#8bcbd355',1,'#749e9d');line(x+10,y-45,x+10,y-6,'#ffffffaa',1);line(x+7,y-8,x+7,y-2,'#537e77',2);
      line(x+3,y+15,x+10,y+15,'#5f958a80',1);line(x+3,y+15,x+6,y+12,'#5f958a80',1);line(x+3,y+15,x+6,y+18,'#5f958a80',1);return;
    }
    if(type==='fire-extinguisher'){
      ellipse(x+w/2,y+h,w*.48,3,'#493d362b');
      rr(x+2,y-2,w-5,h,'#be302b',4,'#98251f');rr(x+3,y-2,w-7,4,'#e96553',2);
      rr(x+4,y+2,2,h-9,'#fa94806b',1);rr(x+4,y+5,w-9,6,'#fff3df',1);line(x+5,y+8,x+w-6,y+8,'#bb3e34',1);
      rr(x+w*.35,y-7,w*.38,5,'#4b5550',1);line(x+w*.32,y-9,x+w*.7,y-9,'#474b46',2);
      line(x+w*.7,y-6,x+w-1,y-3,'#394b43',2);line(x+w-1,y-3,x+w-1,y+h*.7,'#394b43',2);rr(x+w-3,y+h*.58,3,6,'#394b43',1);return;
    }
    if(type==='noticeboard'){
      ellipse(x+w/2,y+h,w*.49,4,'#493d362b');
      line(x+w-9,y+4,x+w-3,y+h-2,'#b48e59',5);line(x+9,y+4,x+5,y+h-2,'#ba9561',5);
      rr(x+2,y+h-10,11,11,'#d3af75',2);rr(x+w-13,y+h-10,11,11,'#d3af75',2);
      rr(x+3,y-5,w-6,h-18,'#d6b47d',2,'#a5804d');rr(x+9,y+1,w-18,h-30,'#253330',1,'#856d49');
      line(x+7,y-2,x+w-7,y-2,'#f4d7a255',1);line(x+6,y+9,x+6,y+h-27,'#f3d6a052',1);
      line(x+w-6,y+5,x+w-6,y+h-25,'#b9976255',1);line(x+8,y+h-27,x+w-8,y+h-27,'#e9c48b',2);
      g.save();g.globalAlpha=.07;ellipse(x+w*.46,y+h*.32,w*.28,7,'#dce6d9');ellipse(x+w*.6,y+h*.47,w*.21,4,'#dce6d9');g.restore();
      g.save();g.translate(x+w/2,y+h*.32);g.rotate(-.04);text('playdata',0,0,11.5,'#e6efd6',500);line(-20,9,20,8,'#bedbd090',1);g.restore();
      const sparkle=(sx,sy)=>{line(sx-3,sy,sx+3,sy,'#bde0d2',1);line(sx,sy-3,sx,sy+3,'#bde0d2',1);};
      sparkle(x+17,y+9);sparkle(x+w-17,y+h-38);return;
    }
    rr(x+3,y+4,w,h,'#43524223',Math.min(4,w/4));
    if(['desk','coffee','roundtable'].includes(type)){
      rr(x+4,y+h-1,3,4,'#8a8471');rr(x+w-7,y+h-1,3,4,'#8a8471');
      if(o.oval||type==='coffee'||type==='roundtable'){
        rr(x,y-1,w,h+3,'#c2bba8',Math.min(w,h)/2);rr(x,y-5,w,h,c||'#f7f6ee',Math.min(w,h)/2);line(x+8,y-3,x+w-8,y-3,'#ffffffaa');
      }else{
        rr(x,y,w,h,'#ab9575',2);rr(x,y-5,w,h,c||'#e1c598',2,'#b8a07a');line(x+3,y-3,x+w-3,y-3,'#ffffff88');
        if(c?.startsWith('#e')||o.teacher){for(let k=10;k<h;k+=13)line(x+2,y+k-5,x+w-2,y+k-5,'#ad90612a');}
      }
      if(o.powered){
        if(h>w){
          rr(x+2,y+4,7,h-9,'#c3aa7c',1);
          for(let i=0;i<4;i++){const sy=y+10+i*(h-30)/3;rr(x+3,sy,6,10,'#faf9ef',1,'#b5ab96');ellipse(x+6,sy+3,.8,.8,'#64706a');ellipse(x+6,sy+7,.8,.8,'#64706a');}
        }else{
          rr(x+5,y-3,w-10,7,'#c3aa7c',1);
          for(let i=0;i<4;i++){const sx=x+9+i*(w-28)/3;rr(sx,y-2,10,6,'#faf9ef',1,'#b5ab96');ellipse(sx+3,y+1,.8,.8,'#64706a');ellipse(sx+7,y+1,.8,.8,'#64706a');}
        }
      }return;
    }
    if(type==='chair'){
      rr(x+1,y,w-2,h,'#555f5c',3);rr(x+1,y-2,w-2,h-3,c,3);rr(x+3,y,w-6,h-6,'#ffffff12',2);
      if(o.dir==='up')rr(x,y+h-5,w,4,c,2);else if(o.dir==='down')rr(x,y-4,w,4,c,2);else if(o.dir==='left')rr(x+w-3,y-3,4,h,c,2);else rr(x-1,y-3,4,h,c,2);
      return;
    }
    if(type==='stool'||type==='ottoman'){
      ellipse(x+w/2,y+h/2+1,w/2,h/2,c||'#ae9369');ellipse(x+w/2,y+h/2-3,w/2,h/2,c||'#ae9369');ellipse(x+w/2-2,y+h/2-5,w/2-3,h/2-3,'#ffffff15');return;
    }
    if(type==='bench'||type==='sofa'){
      rr(x,y,w,h,'#7e837c',5);rr(x,y-5,w,h,c,5,'#747e7440');
      const vertical=h>w;
      if(vertical){rr(x+(o.dir==='right'?0:w-6),y-5,6,h,'#c4c5b5',3);for(let yy=y+20;yy<y+h-5;yy+=23)line(x+6,yy,x+w-4,yy,'#737c7550');}
      else{rr(x,o.dir==='up'?y+h-11:y-5,w,6,'#bac1b3',3);if(o.seats){for(let i=1;i<o.seats;i++)line(x+w*i/o.seats,y+1,x+w*i/o.seats,y+h-5,'#68786a44');}else for(let xx=x+21;xx<x+w-5;xx+=23)line(xx,y+1,xx,y+h-5,'#68786a44');}
      rr(x+2,y-4,4,vertical?9:h-3,'#c0c6b899',2);return;
    }
    if(type==='bar'||type==='counter'||type==='cabinet'){
      rr(x,y,w,h,'#bba487',2);rr(x,y-6,w,h,c||'#f2eee2',2,'#ada78f');line(x+2,y+h-7,x+w-2,y+h-7,'#c5b699');
      if(w>h)for(let xx=x+24;xx<x+w;xx+=28)line(xx,y+1,xx,y+h-7,'#d8d2c1');
      else for(let yy=y+24;yy<y+h;yy+=27)line(x+1,yy,x+w-1,yy,'#d1c8b5');return;
    }
    if(type==='tv'||type==='board'){
      rr(x,y-3,w,h,'#545b56',2);rr(x-1,y-8,w+2,h,'#344642',2);
      rr(x+3,y-6,w-6,h-5,type==='board'?'#5f7e73':'#224d50',1);
      if(type==='tv'&&w>h){rr(x+6,y-4,w*.22,h-9,'#87b9ac',1);rr(x+w*.3,y-4,w*.6,h-9,'#2d6867',1);line(x+w*.34,y+h*.28,x+w*.58,y+h*.28,'#83bfae',1.5);line(x+w*.34,y+h*.5,x+w*.75,y+h*.5,'#e3e9db75',1);rr(x+w*.5-2,y+h-7,4,3,'#9cb2aa',1);}
      if(type==='board'){line(x+10,y-3,x+w*.35,y-3,'#dce7d38a',1);line(x+10,y+1,x+w*.6,y+1,'#dce7d35a',1);}
      return;
    }
    if(type==='laptop'){
      const rotated=o.orientation==='vertical';
      if(rotated){g.save();g.translate(x,y+h);g.rotate(-Math.PI/2);}
      const lx=rotated?0:x,ly=rotated?0:y,lw=rotated?h:w,lh=rotated?w:h;
      rr(lx-1,ly+lh*.35,lw+2,lh*.6,'#a5b2ac',1,'#677b73');rr(lx+2,ly+lh*.48,lw-4,lh*.23,'#687e76',1);rr(lx+lw*.36,ly+lh*.77,lw*.28,lh*.12,'#dbe2d5',1);
      rr(lx,ly-4,lw,lh*.58,'#394e4b',1);rr(lx+2,ly-2,lw-4,lh*.58-4,'#88afb0');line(lx+3,ly-1,lx+lw*.6,ly-1,'#c7e2d0',1);
      if(rotated)g.restore();return;
    }
    if(type==='monitor'){
      rr(x+1,y+h-4,w-2,3,'#606e6b',1);rr(x+w*.4,y+h-6,w*.2,3,'#536c68');rr(x,y-4,w,h-3,'#394e4b',1);rr(x+2,y-2,w-4,h-7,'#88afb0');line(x+3,y-1,x+w*.6,y-1,'#c7e2d0',1);return;
    }
    if(type==='notebook'){rr(x,y-3,w,h,'#eef2df',1,'#a4b3a3');line(x+w/2,y-2,x+w/2,y+h-4,'#c1cbb8');line(x+2,y+1,x+w/2-2,y+1,'#adb6a380');return;}
    if(type==='water'){
      rr(x,y-3,w,h,'#babfb4',2);rr(x,y-9,w,h,'#f3f5ec',2,'#bfc8bb');rr(x+4,y-6,w-8,9,'#b5d8da',2);rr(x+4,y+7,w-8,9,'#546c70',1);rr(x+5,y+8,3,3,'#7cb8d8',1);rr(x+w-8,y+8,3,3,'#df9282',1);rr(x+5,y+h-15,w-10,3,'#aabbb1');return;
    }
    if(type==='coffee-machine'){
      rr(x,y-3,w,h,'#45524e',2);rr(x,y-8,w,h,'#596662',2,'#34473f');rr(x+3,y-6,w-6,6,'#c6d3c6',1);rr(x+4,y+2,w-8,10,'#263d34',1);rr(x+6,y+14,w-12,4,'#b4c2b8',1);rr(x+w/2-2,y+4,4,5,'#bdc8bb',1);
      rr(x+w/2-4,y+10,8,6,'#f4f0dd',1);line(x+w/2+4,y+11,x+w/2+6,y+14,'#f4f0dd',1.5);ellipse(x+w-5,y-3,1.5,1.5,'#88c7ae');return;
    }
    if(type==='printer'){
      rr(x,y,w,h,'#a8b6ad',2,'#80998c');rr(x+1,y-3,w-2,h-3,'#e8eee4',2);rr(x-2,y-10,w+4,14,'#c2d0c5',2,'#869e91');rr(x+2,y-11,w-4,8,'#f8faee',1);rr(x+7,y-15,w-13,5,'#627c70',1);rr(x+10,y-16,w-18,3,'#f4f5e7',1);
      rr(x+w-11,y+1,9,7,'#39594c',1);rr(x+w-9,y+2,5,3,'#8bc9b5',1);rr(x+4,y+10,w-8,8,'#486457',1);rr(x+8,y+10,w-16,4,'#f8f8ed',1);rr(x+4,y+23,w-8,10,'#d6e0d4',1,'#a8bcae');line(x+w/2-4,y+26,x+w/2+4,y+26,'#789284',1.5);rr(x+3,y+h-3,4,4,'#687e71',1);rr(x+w-7,y+h-3,4,4,'#687e71',1);return;
    }
    if(type==='bin'){
      rr(x+2,y,w-4,h,c,3);rr(x,y-4,w,7,'#e3e9db',2,'#88978b');rr(x+4,y-2,w-8,3,c,1);text('↻',x+w/2,y+h/2+1,11,'#f0f5e8',700);return;
    }
    if(type==='pillar'){rr(x,y,w,h,'#babba9',1,'#969d91');rr(x,y-9,w,h,'#f3f1e2',1,'#a8ae9c');rr(x+5,y-4,w-10,h-10,'#e4e0d1');return;}
    if(type==='bookshelf'||type==='bookshelf-side'){
      rr(x,y-3,w,h,'#b59a75',1);rr(x-1,y-7,w+2,h,'#f7f5e9',1,'#c9c6b4');rr(x+2,y-5,w-4,h-5,'#bca27a');
      const colors=['#f3f1e4','#86b6b8','#e8af68','#cb7266','#d6ddd2','#587b81','#95a582','#f2efe0'];
      if(type==='bookshelf'){let xx=x+3,i=0;while(xx<x+w-3){let bw=3+i%3;rr(xx,y-5,bw,h-7,colors[i%colors.length]);line(xx+1,y-3,xx+bw-1,y-3,'#fff9');xx+=bw+1;i++;}}
      else{for(let yy=y-4,i=0;yy<y+h-8;yy+=4,i++)rr(x+2,yy,w-4,3,colors[i%colors.length]);}
      rr(x,y+h-7,w,2,'#f5f3e5');return;
    }
    if(type==='plant'){
      ellipse(x+w/2,y+h*.72,w*.3,h*.2,'#bcab86');rr(x+w*.35,y+h*.45,w*.3,h*.23,'#efe9d8',3);
      for(let i=0;i<8;i++){const a=i*Math.PI/4;g.save();g.translate(x+w/2+Math.cos(a)*w*.19,y+h*.32+Math.sin(a)*h*.15);g.rotate(a+.5);ellipse(0,0,w*.18,h*.3,['#658d61','#4d7b57','#83a26a'][i%3]);g.restore();}
      ellipse(x+w/2,y+h*.28,w*.13,h*.14,'#93af77');return;
    }
    if(type==='box'){rr(x,y-4,w,h,'#c9a374',1,'#b39167');line(x+w/2,y-3,x+w/2,y+h-5,'#ead2ac',3);return;}
    if(type==='stairs'){
      rr(x,y,w,h,'#86998b');for(let i=0;i<8;i++){rr(x+2,y+i*8,w-4,7,['#d0d6c9','#c5cdbf'][i%2]);line(x+2,y+i*8,x+w-2,y+i*8,'#758b7855');}line(x+10,y+7,x+w-12,y+h-10,'#f8f8dc55',2);return;
    }
  }
  function drawWall(w){
    const {x1,y1,x2,y2}=w;if(x1===x2&&y1===y2)return;
    g.lineCap='square';line(x1+3,y1+5,x2+3,y2+5,'#25392726',15);
    line(x1,y1+1,x2,y2+1,w.color||'#aea88f',12);
    line(x1,y1-6,x2,y2-6,'#90998a',13);
    line(x1,y1-7,x2,y2-7,w.color||'#fbf9e9',10);
    line(x1,y1-10,x2,y2-10,'#ffffff94',2);g.lineCap='butt';
  }
  function badge(label,x,y,size=12,bg='#fafbefb8',fg='#566d5f'){
    g.font=`600 ${size}px ${font}`;const tw=g.measureText(label).width;
    rr(x-tw/2-9,y-size/2-5,tw+18,size+10,bg,5);text(label,x,y,size,fg,600);
  }
  function roomLabels(){
    for(const r of D.rooms.filter(r=>r.floor==='class')){
      const labelY=r.front==='bottom'?r.y+Math.min(22,r.h-(r.h>220?228:183)):r.y+r.h-18;
      badge(r.name,r.x+r.w/2,labelY,13);
    }
    g.save();g.translate(D.layoutShiftX||0,0);
    text('라운지 2',352,290,19,'#466858',700);text('LOUNGE 02',352,309,9,'#77927a',600);
    text('복도',758,319,14,'#a8ac97',600);
    badge('직원실',1457,327,12);badge('회의실',1457,530,12);badge('계단',1457,613,11);
    badge('회의공간 1',384,513,11);badge('회의공간 2',384,619,11);badge('창고',1342,76,10);
    text('정수기 · 커피 · 분리수거',1159,74,8,'#687e6a');text('프린터',1264,76,7,'#687e6a');text('정수기 · 분리수거',371,62,8,'#687e6a');
    text('긴 탁자 · 노트북',1204,99,9,'#607969');for(const x of [1106,1183,1259])text('PC 연결 TV',x,270,8,'#607969');
    text('콘센트 작업 탁자',1320,258,9,'#607969');
    text('기둥 책장',1164,439,9,'#748169');text('기둥 책장',1320,468,9,'#748169');
    text('소파 라운지',1153,647,11,'#738567');text('안내 데스크',1333,617,9,'#7e8a72');
    text('유리 출입문',1255,659,9,'#5f8a80');badge('외부 출입구',1260,694,10,'#edf6f3','#52786e');
    line(1324,723,1296,738,'#b897743d');line(1376,723,1402,738,'#b897743d');
    badge('상담실 B',1290,746,12,'#f4dcc4','#986847');badge('상담실 A',1407,746,12,'#fff0b6','#8f7b35');
    g.restore();
  }
  function buildScene(){
    g.clearRect(0,0,D.width,D.height);
    g.save();g.shadowColor='#5e74693a';g.shadowBlur=16;g.shadowOffsetY=9;g.fillStyle='#d4d9c4';g.beginPath();g.moveTo(18,23);g.lineTo(1590,23);g.lineTo(1590,633);g.lineTo(322,633);g.lineTo(322,755);g.lineTo(18,755);g.closePath();g.fill();g.restore();
    if(D.entrance)floor(D.entrance);
    for(const r of D.rooms)floor(r);
    D.objects.filter(o=>floorTypes.has(o.type)).forEach(furniture);
    // Draw service counters before the appliances and recycling bins placed on them.
    D.objects.filter(o=>o.type==='counter').forEach(furniture);
    D.objects.filter(o=>!floorTypes.has(o.type)&&!accessoryTypes.has(o.type)&&!glassTypes.has(o.type)&&o.type!=='counter').sort((a,b)=>a.y+a.h-b.y-b.h).forEach(furniture);
    D.objects.filter(o=>accessoryTypes.has(o.type)).forEach(furniture);
    D.walls.forEach(drawWall);D.objects.filter(o=>glassTypes.has(o.type)).forEach(furniture);roomLabels();
  }
  function distRect(x,y,o){return Math.hypot(Math.max(o.x-x,0,x-o.x-o.w),Math.max(o.y-y,0,y-o.y-o.h));}
  const inside=(r,x,y)=>x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h;
  // Bucket colliders so click-to-walk remains responsive on the complete campus.
  const collisionBuckets=new Map(),bucketSize=64;
  // Furniture may define a floor footprint relative to its drawing bounds.
  const colliders=[...D.walls.map(w=>({x:Math.min(w.x1,w.x2),y:Math.min(w.y1,w.y2),w:Math.abs(w.x2-w.x1),h:Math.abs(w.y2-w.y1),pad:5})),...D.objects.filter(o=>o.solid!==false&&solidTypes.has(o.type)).map(o=>({x:o.x+(o.collision?.x??0),y:o.y+(o.collision?.y??0),w:o.collision?.w??o.w,h:o.collision?.h??o.h,pad:0}))];
  for(const o of colliders){const margin=o.pad+6;for(let yy=Math.floor((o.y-margin)/bucketSize);yy<=Math.floor((o.y+o.h+margin)/bucketSize);yy++)for(let xx=Math.floor((o.x-margin)/bucketSize);xx<=Math.floor((o.x+o.w+margin)/bucketSize);xx++){const id=yy*32+xx;if(!collisionBuckets.has(id))collisionBuckets.set(id,[]);collisionBuckets.get(id).push(o);}}
  function walkable(x,y,radius=5.5){
    if(!D.rooms.some(r=>inside(r,x,y))&&!(D.entrance&&inside(D.entrance,x,y)))return false;
    const candidates=collisionBuckets.get(Math.floor(y/bucketSize)*32+Math.floor(x/bucketSize))||[];
    return !candidates.some(o=>{const dx=Math.max(o.x-x,0,x-o.x-o.w),dy=Math.max(o.y-y,0,y-o.y-o.h);return dx*dx+dy*dy<(radius+o.pad)**2;});
  }
  const roomAt=(x,y)=>[...D.rooms].reverse().find(r=>inside(r,x,y))||(D.entrance&&inside(D.entrance,x,y)?D.entrance:null);
  function move(dx,dy){
    const px=player.x,py=player.y;
    if(walkable(player.x+dx,player.y))player.x+=dx;
    if(walkable(player.x,player.y+dy))player.y+=dy;
    if(Math.abs(dx)>Math.abs(dy))player.dir=dx>0?'right':'left';else if(dy)player.dir=dy>0?'down':'up';
    player.moving=Math.hypot(player.x-px,player.y-py)>.01;return player.moving;
  }
  function screenToWorld(x,y){return {x:(x-camera.x)/camera.zoom,y:(y-camera.y)/camera.zoom};}
  function fitZoom(){return Math.max(.15,Math.min((vw-50)/D.width,(vh-85)/D.height));}
  function fit(){camera.fit=fitZoom();camera.zoom=camera.fit;camera.x=(vw-D.width*camera.zoom)/2;camera.y=(vh-D.height*camera.zoom)/2+12;camera.follow=false;updateZoom();}
  function focusPlayer(){camera.follow=true;camera.zoom=Math.max(camera.zoom,window.innerWidth<700?1.3:1.65);camera.x=vw/2-player.x*camera.zoom;camera.y=vh/2-player.y*camera.zoom;updateZoom();}
  function zoomBy(factor,anchor={x:vw/2,y:vh/2}){
    const before=screenToWorld(anchor.x,anchor.y);camera.zoom=Math.max(.16,Math.min(4.4,camera.zoom*factor));camera.x=anchor.x-before.x*camera.zoom;camera.y=anchor.y-before.y*camera.zoom;camera.follow=false;updateZoom();
  }
  function updateZoom(){$('zoomLabel').textContent=Math.round(camera.zoom*100)+'%';$('followBtn').setAttribute('aria-pressed',String(camera.follow));}
  function resize(){
    const firstView=vw===0||vh===0, center=screenToWorld(vw/2,vh/2), overview=Math.abs(camera.zoom-camera.fit)<.000001;
    const r=viewport.getBoundingClientRect();vw=r.width;vh=r.height;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(vw*dpr);canvas.height=Math.round(vh*dpr);camera.fit=fitZoom();
    if(firstView){focusPlayer();return;}
    if(camera.follow){camera.x=vw/2-player.x*camera.zoom;camera.y=vh/2-player.y*camera.zoom;}
    else if(overview){fit();return;}
    else{camera.x=vw/2-center.x*camera.zoom;camera.y=vh/2-center.y*camera.zoom;}
    updateZoom();
  }
  function drawPlayer(t,actor=player,label='나'){
    // Keep the character behind the raised board while its feet pass freely.
    ctx.save();
    for(const o of noticeboards){
      if(actor.y>=o.y+(o.collision?.y??o.h)||actor.x+13<o.x||actor.x-13>o.x+o.w)continue;
      ctx.beginPath();ctx.rect(0,0,D.width,D.height);ctx.roundRect(o.x+3,o.y-5,o.w-6,o.h-18,2);ctx.clip('evenodd');
    }
    const x=Math.round(actor.x),y=Math.round(actor.y),p=(a,b,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(x+a,y+b,w,h);};
    ctx.fillStyle='#347c6744';ctx.beginPath();ctx.ellipse(x,y+1,13,6,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#ffffffbb';ctx.lineWidth=1.3;ctx.beginPath();ctx.ellipse(x,y+1,12,5,0,0,Math.PI*2);ctx.stroke();
    const stride=actor.moving?Math.sin(t/100)*2:0;
    p(-6,-12,5,10,'#3c5054');p(2,-12,5,10,'#344549');p(-7,-3+stride,6,4,'#293d3c');p(2,-3-stride,6,4,'#293d3c');
    p(-8,-25,16,14,actor.color);p(-7,-24,3,11,'#fff4cc30');p(-11,-23,4,10,'#e3b08a');p(8,-23,4,10,'#d7a07b');
    p(-7,-37,14,13,'#e9bc98');p(-8,-36,2,7,'#263c41');p(-7,-39,14,6,'#263c41');p(-9,-36,17,4,'#263c41');
    if(actor.dir==='up')p(-7,-35,14,8,'#263c41');else{
      if(actor.dir!=='right')p(-4,-29,2,2,'#283c3e');if(actor.dir!=='left')p(3,-29,2,2,'#283c3e');p(-1,-25,3,1,'#b47d63');
    }
    ctx.restore();
    ctx.save();ctx.translate(x,y-50);const sc=1/Math.max(camera.zoom,.5);ctx.scale(sc,sc);ctx.font=`600 11px ${font}`;const tagWidth=Math.max(26,Math.min(154,ctx.measureText(label).width+18));ctx.fillStyle='#ffffffee';ctx.beginPath();ctx.roundRect(-tagWidth/2,-10,tagWidth,20,6);ctx.fill();ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=actor===player?'#326556':'#374e60';ctx.fillText(label,0,0,tagWidth-12);ctx.restore();
  }
  function render(t){
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#eaf0ec';ctx.fillRect(0,0,vw,vh);
    ctx.fillStyle='#cedcd280';for(let x=12;x<vw;x+=24)for(let y=12;y<vh;y+=24){ctx.beginPath();ctx.arc(x,y,.7,0,Math.PI*2);ctx.fill();}
    ctx.save();ctx.translate(camera.x,camera.y);ctx.scale(camera.zoom,camera.zoom);ctx.drawImage(scene,0,0,D.width,D.height);
    if(path.length){ctx.strokeStyle='#25867890';ctx.lineWidth=2/camera.zoom;ctx.setLineDash([4/camera.zoom,6/camera.zoom]);ctx.beginPath();ctx.moveTo(player.x,player.y);for(const p of path)ctx.lineTo(p.x,p.y);ctx.stroke();ctx.setLineDash([]);const p=path[path.length-1];ctx.fillStyle='#26867b';ctx.beginPath();ctx.arc(p.x,p.y,3/camera.zoom,0,Math.PI*2);ctx.fill();}
    if(hover?.name){ctx.strokeStyle='#399781a8';ctx.lineWidth=2/camera.zoom;ctx.beginPath();ctx.roundRect(hover.x-3,hover.y-11,hover.w+6,hover.h+15,4);ctx.stroke();}
    const actors=[player,...presence.peers.values()].sort((a,b)=>a.y-b.y);
    for(const actor of actors)drawPlayer(t,actor,actor===player?'나':actor.nickname);
    ctx.restore();
    document.querySelector('.minimap-frame').hidden=camera.zoom<=camera.fit*1.15;
    const s=mini.width/D.width;mctx.clearRect(0,0,mini.width,mini.height);mctx.drawImage(scene,0,0,mini.width,D.height*s);
    const origin=screenToWorld(0,0);mctx.strokeStyle='#348a78';mctx.lineWidth=.8;mctx.strokeRect(origin.x*s,origin.y*s,vw/camera.zoom*s,vh/camera.zoom*s);
    for(const peer of presence.peers.values()){mctx.fillStyle=peer.color;mctx.beginPath();mctx.arc(peer.x*s,peer.y*s,2.5,0,Math.PI*2);mctx.fill();mctx.strokeStyle='white';mctx.lineWidth=.7;mctx.stroke();}
    mctx.fillStyle='#e2943d';mctx.beginPath();mctx.arc(player.x*s,player.y*s,3,0,Math.PI*2);mctx.fill();mctx.strokeStyle='white';mctx.lineWidth=1;mctx.stroke();
  }
  function update(t){
    const dt=Math.min((t-lastTime)/1000,.04)||.016;lastTime=t;player.moving=false;
    if(!isDialogOpen()){
      const k=new Set([...keys,...touchKeys]);let dx=(k.has('d')||k.has('arrowright')?1:0)-(k.has('a')||k.has('arrowleft')?1:0),dy=(k.has('s')||k.has('arrowdown')?1:0)-(k.has('w')||k.has('arrowup')?1:0);
      if(dx||dy){path=[];const length=Math.hypot(dx,dy);move(dx/length*125*dt,dy/length*125*dt);}
      else if(path.length){const next=path[0],d=Math.hypot(next.x-player.x,next.y-player.y),speed=125*dt;if(d<speed){move(next.x-player.x,next.y-player.y);path.shift();}else if(!move((next.x-player.x)/d*speed,(next.y-player.y)/d*speed))path=[];}
    }
    checkExit();
    presence.tick(t,dt);
    if(camera.follow){camera.x+=(vw/2-player.x*camera.zoom-camera.x)*Math.min(dt*9,1);camera.y+=(vh/2-player.y*camera.zoom-camera.y)*Math.min(dt*9,1);}
    const r=roomAt(player.x,player.y);if(r&&r.id!==lastRoom){lastRoom=r.id;$('currentRoom').textContent=r.name;for(const b of document.querySelectorAll('[data-room]')){b.classList.toggle('active',b.dataset.room===r.id);b.setAttribute('aria-current',b.dataset.room===r.id?'location':'false');}}
    nearby=D.objects.filter(o=>o.name&&distRect(player.x,player.y,o)<35).sort((a,b)=>distRect(player.x,player.y,a)-distRect(player.x,player.y,b))[0]||null;
    $('interactionPrompt').hidden=!nearby;if(nearby)$('interactionPrompt').querySelector('span').textContent=nearby.name;
    render(t);requestAnimationFrame(update);
  }
  function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,2800);}
  function closestOpen(x,y,max=55){if(walkable(x,y))return {x,y};for(let radius=4;radius<=max;radius+=4)for(let i=0;i<24;i++){const a=i*Math.PI/12,p={x:x+Math.cos(a)*radius,y:y+Math.sin(a)*radius};if(walkable(p.x,p.y))return p;}return null;}
  function checkExit(){
    // Logout belongs to the authenticated Django map, which supplies this form.
    if(!logoutForm||!D.entrance||isDialogOpen()||logoutPending)return;
    if(D.rooms.some(r=>inside(r,player.x,player.y))&&player.y<=D.entrance.y-12)exitReturnPoint={x:player.x,y:player.y};
    if(!inside(D.entrance,player.x,player.y)||player.y<=D.entrance.y+6)return;
    path=[];keys.clear();touchKeys.clear();player.moving=false;
    exitDialog.showModal();$('exitNo').focus();
  }
  function cancelExit(){
    if(!exitDialog.open||logoutPending)return;
    const point=closestOpen(exitReturnPoint.x,Math.min(exitReturnPoint.y,D.entrance.y-12),30)||closestOpen(...spawn,30);
    if(point){player.x=point.x;player.y=point.y;}
    path=[];keys.clear();touchKeys.clear();player.moving=false;
    exitDialog.close();canvas.focus({preventScroll:true});
  }
  function confirmExit(){
    if(!exitDialog.open||!logoutForm||logoutPending)return;
    logoutPending=true;$('exitYes').disabled=true;$('exitNo').disabled=true;
    path=[];keys.clear();touchKeys.clear();player.moving=false;
    // Submit the existing POST form with Django's CSRF token and session cookie.
    logoutForm.requestSubmit();
  }
  function goToRoom(id){const r=D.rooms.find(r=>r.id===id);if(!r)return;const p=closestOpen(...r.target,30);if(!p){toast('이 공간의 출입구를 확인해 주세요.');return;}path=[];player.x=p.x;player.y=p.y;focusPlayer();canvas.focus({preventScroll:true});toast(r.name+'에 도착했습니다.');}
  function showDetail(item){
    if(item.type==='noticeboard'){showBoard();return;}
    const r=D.rooms.find(r=>r.id===(item.roomId||item.id));selectedRoom=r?.id||null;
    $('detailTitle').textContent=item.name;$('detailEyebrow').textContent=item.type?'FACILITY GUIDE':'SPACE GUIDE';
    $('detailText').textContent=item.description||r?.description||'캠퍼스 안에 배치된 '+item.name+'입니다. 캐릭터로 가까이 이동해 공간을 둘러보세요.';
    const photo=item.photo??r?.photo;$('detailImage').hidden=!photo;if(photo){$('detailImage').src=photo;$('detailImage').alt=item.name+' 참고 사진';}else $('detailImage').removeAttribute('src');
    $('detailTags').replaceChildren();for(const label of item.tags||r?.tags||[]){const e=document.createElement('span');e.textContent=label;$('detailTags').append(e);}
    $('detailMove').hidden=!selectedRoom;keys.clear();touchKeys.clear();dialog.showModal();
  }
  function showBoard(){
    path=[];keys.clear();touchKeys.clear();player.moving=false;
    showBoardChoices(false);
    for(const card of boardCards){card.setAttribute('aria-pressed','false');card.querySelector('.board-card-state').textContent='선택하기';}
    $('boardSelection').textContent='';boardDialog.showModal();$('boardMenuCard').focus({preventScroll:true});
  }
  function cancelMenuRequest(){menuRequest?.abort();menuRequest=null;menuVersion++;$('boardMenuImage').onload=$('boardMenuImage').onerror=null;$('boardMenuImage').removeAttribute('src');}
  function showBoardChoices(focus=true){
    cancelMenuRequest();$('boardMenuView').hidden=true;$('boardChoices').hidden=false;$('boardDescription').hidden=false;$('boardSelection').hidden=false;
    if(focus)$('boardMenuCard').focus({preventScroll:true});
  }
  async function showMenuPhoto(){
    cancelMenuRequest();const version=menuVersion;menuRequest=new AbortController();
    $('boardChoices').hidden=true;$('boardDescription').hidden=true;$('boardSelection').hidden=true;$('boardMenuView').hidden=false;$('boardMenuView').setAttribute('aria-busy','true');
    $('boardMenuImage').hidden=true;$('boardMenuOpen').hidden=true;$('boardMenuOpen').removeAttribute('href');$('boardMenuUpdated').textContent='';$('boardMenuStatus').textContent='식단 사진을 불러오는 중이에요.';$('boardMenuBack').focus({preventScroll:true});
    const failed=()=>{if(version!==menuVersion)return;$('boardMenuView').setAttribute('aria-busy','false');$('boardMenuImage').hidden=true;$('boardMenuOpen').hidden=true;$('boardMenuStatus').textContent='식단 사진을 불러오지 못했어요. 카드 선택으로 돌아가 다시 선택해 주세요.';};
    try{
      const response=await fetch('/api/board/menu/',{credentials:'same-origin',cache:'no-store',signal:menuRequest.signal});
      if(!response.ok||response.redirected||!response.headers.get('content-type')?.includes('application/json'))throw new Error('Menu unavailable');
      const data=await response.json();if(version!==menuVersion||!boardDialog.open)return;
      if(!data.imageUrl){$('boardMenuView').setAttribute('aria-busy','false');$('boardMenuStatus').textContent='아직 등록된 식단 사진이 없어요.';return;}
      const imageUrl=new URL(data.imageUrl,window.location.href);if(imageUrl.origin!==window.location.origin||!imageUrl.pathname.startsWith('/api/board/menu/images/'))throw new Error('Unexpected menu image');
      const updated=new Date(data.updatedAt);if(!Number.isFinite(updated.getTime()))throw new Error('Invalid photo date');
      $('boardMenuSource').textContent=data.sourceName;
      $('boardMenuUpdated').textContent='가져온 시간 · '+new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(updated);
      $('boardMenuImage').onload=()=>{if(version!==menuVersion)return;$('boardMenuView').setAttribute('aria-busy','false');$('boardMenuStatus').textContent='';$('boardMenuOpen').hidden=false;};
      $('boardMenuImage').onerror=failed;$('boardMenuOpen').href=imageUrl.href;$('boardMenuImage').hidden=false;$('boardMenuImage').src=imageUrl.href;
    }catch(error){if(error.name!=='AbortError')failed();}
  }
  function nav(){
    const groups=[['라운지',['lounge1','lounge2']],['강의 공간',['class1','class2','class3','class4','left-top','left-middle','left-bottom']],['회의 · 상담',['meeting','meeting-l2-a','meeting-l2-b','consult-a','consult-b']],['기타 공간',['office','storage']]];
    for(const [label,ids] of groups){const heading=document.createElement('div');heading.className='nav-group-label';heading.textContent=label;$('roomNav').append(heading);for(const id of ids){const r=D.rooms.find(r=>r.id===id),b=document.createElement('button');b.type='button';b.className='room-nav-button';b.dataset.room=id;const icon=document.createElement('span');icon.className='nav-icon';icon.textContent=id.startsWith('lounge')?'L'+id.slice(-1):id.startsWith('class')?id.slice(-1):id.startsWith('consult')?id.slice(-1).toUpperCase():id.startsWith('left')?'C':'▤';const n=document.createElement('span');n.textContent=r.name;b.append(icon,n);b.addEventListener('click',()=>goToRoom(id));b.addEventListener('dblclick',()=>showDetail(r));$('roomNav').append(b);}}
  }
  // Start near the character; overview and manual zoom remain available.
  const navigation=window.CampusNavigation.create({width:D.width,height:D.height,isWalkable:walkable});
  function walkTo(x,y){
    const p=closestOpen(x,y,30);if(!p){toast('통로의 빈 바닥을 선택해 주세요.');return false;}
    const route=navigation.route({x:player.x,y:player.y},p);if(!route){toast('연결된 출입구 쪽 바닥을 선택해 주세요.');return false;}path=route;return true;
  }
  let gesture=null;
  function pointerPosition(e){const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;const p=pointerPosition(e);gesture={...p,px:p.x,py:p.y,dragged:false};canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});});
  canvas.addEventListener('pointermove',e=>{const p=pointerPosition(e);if(gesture){if(Math.hypot(p.x-gesture.x,p.y-gesture.y)>5)gesture.dragged=true;if(gesture.dragged){camera.x+=p.x-gesture.px;camera.y+=p.y-gesture.py;camera.follow=false;updateZoom();canvas.style.cursor='grabbing';}gesture.px=p.x;gesture.py=p.y;hover=null;}else{const w=screenToWorld(p.x,p.y);hover=[...D.objects].reverse().find(o=>o.name&&w.x>=o.x-3&&w.x<=o.x+o.w+3&&w.y>=o.y-11&&w.y<=o.y+o.h+3)||null;canvas.style.cursor=hover?'pointer':'crosshair';}});
  canvas.addEventListener('pointerup',e=>{if(!gesture)return;const p=pointerPosition(e),wasDrag=gesture.dragged;gesture=null;canvas.style.cursor='crosshair';if(wasDrag)return;const w=screenToWorld(p.x,p.y);const o=[...D.objects].reverse().find(o=>o.name&&w.x>=o.x-3&&w.x<=o.x+o.w+3&&w.y>=o.y-11&&w.y<=o.y+o.h+3);if(o){showDetail(o);return;}if(!roomAt(w.x,w.y)){toast('맵 안의 바닥을 클릭해 주세요.');return;}walkTo(w.x,w.y);});
  canvas.addEventListener('pointercancel',()=>{gesture=null;canvas.style.cursor='crosshair';});canvas.addEventListener('pointerleave',()=>hover=null);
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoomBy(Math.exp(-e.deltaY*.0015),pointerPosition(e));},{passive:false});
  const directions={up:'arrowup',down:'arrowdown',left:'arrowleft',right:'arrowright'};
  for(const b of document.querySelectorAll('[data-move]')){b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);touchKeys.add(directions[b.dataset.move]);});for(const evt of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(evt,()=>touchKeys.delete(directions[b.dataset.move]));}
  mini.addEventListener('pointerdown',e=>{const r=mini.getBoundingClientRect();const x=(e.clientX-r.left)/r.width*D.width,y=(e.clientY-r.top)/r.width*D.width;camera.x=vw/2-x*camera.zoom;camera.y=vh/2-y*camera.zoom;camera.follow=false;updateZoom();});
  buildScene();nav();new ResizeObserver(resize).observe(viewport);
  document.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(isDialogOpen())return;if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k)){e.preventDefault();keys.add(k);}else if(k==='e'&&nearby){e.preventDefault();showDetail(nearby);}else if(k===' '){e.preventDefault();fit();}else if(k==='+'||k==='=')zoomBy(1.2);else if(k==='-')zoomBy(1/1.2);});
  document.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>{keys.clear();touchKeys.clear();});
  $('overviewBtn').onclick=fit;$('followBtn').onclick=()=>{if(camera.follow){camera.follow=false;updateZoom();}else focusPlayer();};
  $('zoomIn').onclick=()=>zoomBy(1.25);$('zoomOut').onclick=()=>zoomBy(1/1.25);
  $('fullscreenBtn').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.querySelector('.map-shell').requestFullscreen();}catch{toast('현재 창에서는 전체 화면을 사용할 수 없습니다.');}};
  $('closeDialog').onclick=$('detailClose').onclick=()=>dialog.close();$('detailMove').onclick=()=>{dialog.close();goToRoom(selectedRoom);};
  $('closeBoardDialog').onclick=$('boardClose').onclick=()=>boardDialog.close();
  for(const card of boardCards)card.addEventListener('click',()=>{
    for(const option of boardCards){const selected=option===card;option.setAttribute('aria-pressed',String(selected));option.querySelector('.board-card-state').textContent=selected?'선택됨':'선택하기';}
    $('boardSelection').textContent=card.dataset.boardChoice+' 카드가 선택됐어요.';
    if(card.id==='boardMenuCard')showMenuPhoto();
  });
  $('boardMenuBack').onclick=()=>showBoardChoices();
  boardDialog.addEventListener('close',()=>{cancelMenuRequest();keys.clear();touchKeys.clear();canvas.focus({preventScroll:true});});
  boardDialog.addEventListener('click',e=>{if(e.target!==boardDialog)return;const r=boardDialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)boardDialog.close();});
  $('exitNo').onclick=cancelExit;$('exitYes').onclick=confirmExit;
  exitDialog.addEventListener('cancel',e=>{e.preventDefault();cancelExit();});
  dialog.addEventListener('click',e=>{const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();});
  $('referenceBtn').onclick=()=>showDetail({name:'캠퍼스 설계도',photo:'assets/blueprint.png',description:'제공해 주신 설계도를 기준으로 방의 위치와 비율을 반영했습니다. 복도 오른쪽은 라운지 1, 왼쪽은 라운지 2입니다. 문이 표시되지 않은 곳에는 이동을 위한 출입구를 추가했습니다. 사진이 없는 강의실·직원실·회의실의 가구는 기본 구성으로 채웠습니다.',tags:['원본 설계도','실제 사진 반영','출입구 위치 추정']});
  $('interactionPrompt').querySelector('button').onclick=()=>nearby&&showDetail(nearby);
  const colors=['#dfa34d','#4e9b91','#8a78bb','#cb7773','#648eb5'];let colorIndex=0;$('colorBtn').onclick=()=>{player.color=colors[++colorIndex%colors.length];$('colorBtn').querySelector('span').style.background=player.color;};
  window.CampusApp={goToRoom,walkable,roomAt,showDetail,scene,player,camera,screenToWorld,closestOpen,navigation,walkTo,get path(){return path;},toast,zoomBy,fit};
  requestAnimationFrame(update);
})();
