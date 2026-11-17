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
test('civil branch remains static',()=>{for(const nodeId of ['qing_act2_civil']) {const id=catalog.scenes.nodes.qing[nodeId];assert.equal(animation.pathFor({faction:'qing',nodeId,asset:catalog.assets.find(a=>a.id===id)}),null)}});

test('approved photoreal council GIF shared across devices; other scenes and originals preserved',()=>{
 const asset=catalog.assets.find(a=>a.id==='qing_bg_chongzheng_snow_council');
 for(const device of ['mobile','desktop']) assert.equal(animation.pathFor({faction:'qing',nodeId:'qing_act1',asset,device}),'data/illustrations/qing/animated/qing_bg_chongzheng_snow_council-photoreal-v1.gif');
 assert.ok(fs.existsSync('data/illustrations/qing/animated/qing_bg_chongzheng_snow_council-npc-v2.gif'));
 for(const nodeId of ['qing_act2_iron','qing_act2_steppe']) assert.match(animation.pathFor({faction:'qing',nodeId,asset:catalog.assets.find(a=>a.id===animation.scenes[nodeId])}),/-npc-v2\.gif$/);
});
