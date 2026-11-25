'use strict';
const W = 1920, H = 720;
const WHITE = '#edf0ea', LCD = '#ff5547', SCALE_RED = '#ff2010';
const GLYPHS = {
    '0': [[[2,0],[8,0],[10,2],[10,12],[8,14],[2,14],[0,12],[0,2],[2,0]]],
    '1': [[[3,2],[5,0],[5,14]]],
    '2': [[[0,1],[2,0],[8,0],[10,2],[10,5],[0,10],[0,14],[10,14]]],
    '3': [[[0,0],[8,0],[10,2],[10,5],[8,7],[3,7]],[[8,7],[10,9],[10,12],[8,14],[0,14]]],
    '4': [[[8,14],[8,0],[0,9],[10,9]]],
    '5': [[[10,0],[0,0],[0,7],[8,7],[10,9],[10,12],[8,14],[0,14]]],
    '6': [[[9,0],[3,0],[0,3],[0,12],[2,14],[8,14],[10,12],[10,9],[8,7],[0,7]]],
    '7': [[[0,0],[10,0],[3,14]]],
    '8': [[[2,0],[8,0],[10,2],[10,5],[8,7],[2,7],[0,5],[0,2],[2,0]],[[2,7],[0,9],[0,12],[2,14],[8,14],[10,12],[10,9],[8,7]]],
    '9': [[[10,7],[2,7],[0,5],[0,2],[2,0],[8,0],[10,2],[10,11],[7,14],[1,14]]],
    C: [[[10,0],[2,0],[0,2],[0,12],[2,14],[10,14]]],
    E: [[[10,0],[0,0],[0,14],[10,14]],[[0,7],[8,7]]],
    F: [[[10,0],[0,0],[0,14]],[[0,7],[8,7]]],
    H: [[[0,0],[0,14]],[[10,0],[10,14]],[[0,7],[10,7]]],
    I: [[[0,0],[10,0]],[[5,0],[5,14]],[[0,14],[10,14]]],
    K: [[[0,0],[0,14]],[[10,0],[0,8],[10,14]]],
    L: [[[0,0],[0,14],[10,14]]],
    M: [[[0,14],[0,0],[5,6],[10,0],[10,14]]],
    N: [[[0,14],[0,0],[10,14],[10,0]]],
    O: [[[2,0],[8,0],[10,2],[10,12],[8,14],[2,14],[0,12],[0,2],[2,0]]],
    R: [[[0,14],[0,0],[8,0],[10,2],[10,5],[8,7],[0,7]],[[5,7],[10,14]]],
    X: [[[0,0],[10,14]],[[10,0],[0,14]]],
    '/': [[[0,14],[10,0]]]
};
function text(c, value, x, y, height, color, align, stretch, strokeWidth) {
    const s = height/14, sx = s*(stretch || 1), advance = 14*sx;
    const width = value.length*advance-4*sx;
    if(align==='center')x-=width/2;
    for(let i=0;i<value.length;i++)for(const line of GLYPHS[value[i]] || [])
        c.polyline(line.map((p)=>[x+i*advance+p[0]*sx,y+p[1]*s]),strokeWidth || Math.max(2.2,s*1.5),color);
}
function curve(t) {
    const u = 1-t;
    return [u*u*u*98+3*u*u*t*288+3*u*t*t*814+t*t*t*1244,
        u*u*u*566+3*u*u*t*256+3*u*t*t*72+t*t*t*168];
}
function normal(t) {
    const a=curve(Math.max(0,t-0.001)),b=curve(Math.min(1,t+0.001));
    const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.sqrt(dx*dx+dy*dy);
    return [-dy/length,dx/length];
}
function textures(Canvas, options) {
    const face = new Canvas(W,H), mask = new Canvas(W,H);
    face.clear('#000000');
    face.roundRect(700,508,550,132,10,'#100302');
    const edge=(t,side)=>{ const p=curve(t),n=normal(t);return [p[0]+n[0]*37*side,p[1]+n[1]*37*side]; };
    for(let i=0;i<140;i++) {
        const a=(i+0.09)/140,b=(i+0.91)/140;
        mask.convex([edge(a,-1),edge(b,-1),edge(b,1),edge(a,1)],
            [Math.round((i+0.5)/140*255),64,255,255]);
    }
    const guide=[];
    for(let i=0;i<=140;i++){
        const p=curve(i/140),n=normal(i/140);
        guide.push([p[0]+n[0]*51,p[1]+n[1]*51]);
    }
    face.polyline(guide,4,WHITE);
    for(let rpm=0;rpm<=7000;rpm+=500){
        const t=rpm/7000,p=curve(t),n=normal(t),major=rpm%1000===0;
        const half=major?4:2.25,end=major?68:61;
        const corners=(distance,side)=>[p[0]+n[0]*distance+n[1]*half*side,p[1]+n[1]*distance-n[0]*half*side];
        face.convex([corners(53,-1),corners(end,-1),corners(end,1),corners(53,1)],WHITE);
    }
    for(let rpm=0;rpm<=7000;rpm+=1000) {
        const t=rpm/7000,p=curve(t),n=normal(t);
        text(face,String(rpm/1000),p[0]+n[0]*97,p[1]+n[1]*97-19,38,WHITE,'center',1.7,
            options && options.tachNumberStroke);
    }
    text(face,'X1000 R/MIN',206,653,19,WHITE);
    text(face,'KM/H',1228,469,25,LCD);
    text(face,'KM',931,604,18,LCD);
    text(face,'OIL',1005,604,18,LCD);
    text(face,'C',1205,604,18,LCD);
    face.circle(1196,604,2.5,LCD);

    const horizontalGaugeEnds = options && options.horizontalGaugeEnds;
    for(const [cx,cy,radius,kind] of [[1485,388,175,128],[1682,594,175,192]]){
        for(let i=0;i<28;i++)mask.arc(cx,cy,radius-36,radius,270+(i+0.09)*180/28,270+(i+0.91)*180/28,
            [Math.round((i+0.5)/28*255),kind,255,255]);
        face.arc(cx,cy,radius-46,radius-42,270,450,WHITE);
        const tickAngles = horizontalGaugeEnds ? [-Math.PI/2] : [-Math.PI,-Math.PI/2,0];
        for(const angle of tickAngles){
            const dx=Math.cos(angle),dy=Math.sin(angle),end=angle===-Math.PI/2?radius-58:radius-38;
            const corner=(r,side)=>[cx+dx*r-dy*3*side,cy+dy*r+dx*3*side];
            face.convex([corner(radius-44,-1),corner(end,-1),corner(end,1),corner(radius-44,1)],WHITE);
        }
        if(horizontalGaugeEnds){
            // Sit just below the live fill so its first and last segments never cover the marks.
            const [left,right] = kind === 128 ? [WHITE,SCALE_RED] : [SCALE_RED,WHITE];
            face.fillRect(cx-radius,cy+1,36,10,left);
            face.fillRect(cx-radius+43,cy+1,13,10,left);
            face.fillRect(cx+radius-56,cy+1,13,10,right);
            face.fillRect(cx+radius-36,cy+1,36,10,right);
        }
    }
    // Wide, rounded scale lettering matching the instrument's face, without font or image sampling.
    face.strokeRoundRect(1369,361,52,34,6,4.5,WHITE);
    face.fillRect(1415,369,10,18,'#000000');
    face.line(1552.5,361,1552.5,395,4.5,WHITE);
    face.line(1597.5,361,1597.5,395,4.5,WHITE);
    face.line(1552.5,378,1597.5,378,4.5,WHITE);
    for(const [cx,cy,isE] of [[1592,567,true],[1772,567,false]]){
        face.line(cx-21,cy,cx-21,cy+34,4.5,WHITE);
        face.line(cx-21,cy,cx+21,cy,4.5,WHITE);
        face.line(cx-21,cy+17,cx+15,cy+17,4.5,WHITE);
        if(isE)face.line(cx-21,cy+34,cx+21,cy+34,4.5,WHITE);
    }
    // Filled automotive pictograms, separated from the guide and endpoint lettering.
    face.roundRect(1480,338,10,36,5,WHITE);
    face.circle(1485,375,8,WHITE);
    for(const y of [345,353,361])face.line(1490,y,1497,y,3,WHITE);
    for(const y of [388,397]){
        const wave=[];
        for(let i=0;i<=32;i++)wave.push([1453+i*2,y+Math.sin(i*Math.PI/8)*2.4]);
        face.polyline(wave,3.5,WHITE);
    }
    face.roundRect(1663,544,34,50,2,WHITE);
    face.roundRect(1669,550,22,19,1,'#000000');
    face.roundRect(1658,594,44,5,1,WHITE);
    face.polyline([[1697,554],[1705,562],[1705,585],[1711,592],[1717,586],[1717,555],[1706,544]],4,WHITE);
    face.convex([[1705,541],[1722,555],[1717,562],[1700,547]],WHITE);
    return {face:face,mask:mask};
}
module.exports = { textures: textures };
