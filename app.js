let words=[];
fetch('data/words.json').then(r=>r.json()).then(d=>words=d);
function quiz(){
let w=words[Math.floor(Math.random()*words.length)];
let opts=[w];
while(opts.length<4){
let r=words[Math.floor(Math.random()*words.length)];
if(!opts.includes(r)) opts.push(r);
}
opts=opts.sort(()=>Math.random()-0.5);
document.getElementById('app').innerHTML=
'<h2>'+w.en+'</h2>'+
opts.map(o=>'<button onclick="check(\''+o.bg+'\',\''+w.bg+'\')">'+o.bg+'</button>').join('');
}
function check(s,c){alert(s===c?'Correct':'Wrong '+c);}