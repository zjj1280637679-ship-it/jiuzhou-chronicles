const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const animation=require('./harness/scene-animation.js');const catalog=require('./data/illustrations/catalog.json');
const {publicPathAllowed}=require('./server.js');
for(const [nodeId,id] of Object.entries(animation.scenes))test(nodeId+' selects a real GIF and preserves static asset',()=>{
 const asset=catalog.assets.find(a=>a.id===id); const input={faction:'qing',nodeId,asset};
 const p=animation.pathFor(input),b=fs.readFileSync(p);assert.equal(b.subarray(0,6).toString(),'GIF89a');
 assert.equal(b.readUInt16LE(6),836);assert.equal(b.readUInt16LE(8),470);assert.ok(b.includes(Buffer.from('NETSCAPE2.0')));assert.ok(publicPathAllowed(p));assert.ok(fs.existsSync(asset.relativePath));
 assert.equal(animation.pathFor({...input,reducedMotion:true}),null);assert.equal(animation.pathFor({...input,override:true}),null);assert.equal(animation.pathFor({...input,faction:'ming'}),null);assert.equal(animation.pathFor({...input,asset:{id:'wrong'}}),null);
});
test('other nodes and missing state remain static',()=>{assert.equal(animation.pathFor(),null);assert.equal(animation.pathFor({faction:'qing',nodeId:'qing_act3_iron',asset:{id:'qing_bg_chongzheng_snow_council'}}),null)});

test('approved action GIFs shared across devices; originals preserved',()=>{
 const asset=catalog.assets.find(a=>a.id==='qing_bg_chongzheng_snow_council');
 for(const device of ['mobile','desktop']) assert.equal(animation.pathFor({faction:'qing',nodeId:'qing_act1',asset,device}),'data/illustrations/qing/animated/qing_bg_chongzheng_snow_council-action-v1.gif');
 assert.ok(fs.existsSync('data/illustrations/qing/animated/qing_bg_chongzheng_snow_council-npc-v2.gif'));
 for(const nodeId of ['qing_act2_iron','qing_act2_steppe']) assert.match(animation.pathFor({faction:'qing',nodeId,asset:catalog.assets.find(a=>a.id===animation.scenes[nodeId])}),/-action-v1\.gif$/);
});

test('every mapped GIF has a matching first-frame PNG, also selected for reduced motion',()=>{
 for(const nodeId of Object.keys(animation.scenes)) {
  const asset=catalog.assets.find(a=>a.id===animation.scenes[nodeId]),input={faction:'qing',nodeId,asset};
  const p=animation.posterFor(input),gif=fs.readFileSync(animation.pathFor(input)),png=fs.readFileSync(p);
  assert.equal(p,animation.pathFor(input).replace(/\.gif$/,'-first-frame.png'));
  assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png.readUInt32BE(16),gif.readUInt16LE(6));assert.equal(png.readUInt32BE(20),gif.readUInt16LE(8));
  assert.equal(animation.posterFor({...input,reducedMotion:true}),p);assert.equal(animation.posterFor({...input,override:true}),null);
 }
});

test('exactly ten early faction nodes are mapped, later branches remain unchanged',()=>{assert.equal(Object.keys(animation.scenes).length,10);assert.ok(animation.scenes.qing_act2_civil);for(const nodeId of ['qing_act3_iron_exhaustion','qing_act3_civil_backlash','qing_act3_steppe_fracture']){const id=catalog.scenes.nodes.qing[nodeId];assert.equal(animation.pathFor({faction:'qing',nodeId,asset:{id}}),null)}});

test('first act pages match actual normalized beats, not arbitrary page indices',()=>{
 const {WebVisualNovelEngine}=require('./app.js'),world=require('./skills-data.js');
 const e=Object.create(WebVisualNovelEngine.prototype);
 const beats=e.normalizeAndChunkBeats(world.canonicalTrees.qing.nodes.qing_act1.originalBeats,90);
 assert.equal(beats.length,4);assert.equal(animation.firstActPages.length,4);
 const asset=catalog.assets.find(a=>a.id===animation.scenes.qing_act1),input={faction:'qing',nodeId:'qing_act1',asset};
 const paths=beats.map((b,i)=>{
  assert.equal(b.text,animation.firstActPages[i].text);
  const path=animation.pathFor({...input,pageText:b.text});
  assert.equal(path,`data/illustrations/qing/static/qing_act1-page-${i+1}-shot-v1.webp`);
  const webp=fs.readFileSync(path);assert.equal(webp.subarray(0,4).toString(),'RIFF');assert.equal(webp.subarray(8,12).toString(),'WEBP');assert.ok(webp.length < 250000);
  assert.ok(publicPathAllowed(path));assert.ok(fs.existsSync(animation.posterFor({...input,pageText:b.text})));
  assert.equal(animation.pathFor({...input,pageText:b.text,reducedMotion:true}),path);
  assert.equal(animation.pathFor({...input,pageText:b.text,override:true}),null);
  return path;
 });
 assert.equal(new Set(paths).size,4);
 for(const i of [3,2,1,0,1,2,3])assert.equal(animation.pathFor({...input,pageText:beats[i].text}),paths[i]);
 assert.equal(animation.pathFor({...input,pageText:'用户自由输入产生的新剧情'}),animation.pathFor(input));
 const other={faction:'qing',nodeId:'qing_act2_iron',asset:catalog.assets.find(a=>a.id===animation.scenes.qing_act2_iron)};
 assert.equal(animation.pathFor({...other,pageText:beats[0].text}),animation.pathFor(other));
});
