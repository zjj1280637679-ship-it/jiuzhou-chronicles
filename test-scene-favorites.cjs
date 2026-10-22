const {test} = require("node:test");
const assert = require("node:assert/strict");
const favorites = require("./scene-favorites.js");
const {WebVisualNovelEngine} = require("./app.js");
const value = {faction:"ming",chapter:"ming_act1",turn:3,step:2,speaker:"百姓",sub:"城门",text:"你收起粮册。",image:"data/illustrations/ming/battle.jpg"};
const entry = () => ({...value,id:favorites.fingerprint(value)});
function storage() { const data = new Map(); return {getItem:key=>data.get(key) ?? null,setItem:(key,value)=>data.set(key,value)}; }
test("favorites use a stable scene ID, survive reload and never serialize private config", () => {
  const data = storage(), store = favorites.createStore(data);
  assert.equal(store.add({...entry(), apiKey:"fixture-private", apiHistory:["hidden"],reasoning:"private"}).ok, true);
  assert.equal(store.add(entry()).duplicate,true);
  const raw = data.getItem(favorites.STORAGE_KEY);
  assert.ok(!raw.includes("fixture-private") && !raw.includes("apiHistory") && !raw.includes("reasoning"));
  const restored = favorites.createStore(data);
  assert.equal(restored.list().length,1);
  assert.equal(restored.list()[0].text,value.text);
  const copy=restored.list();copy[0].text="tamper";
  assert.equal(restored.list()[0].text,value.text);
  assert.notEqual(favorites.fingerprint({...value,text:"改写的场景"}),entry().id);
});
test("quota and unreadable favorites never destroy the last good collection", () => {
  const data = storage(), store = favorites.createStore(data);
  store.add(entry()); const good = data.getItem(favorites.STORAGE_KEY);
  data.setItem=()=>{throw new Error("QuotaExceededError")};
  assert.equal(store.remove(entry().id).ok,false);
  assert.equal(store.list().length,1);assert.equal(data.getItem(favorites.STORAGE_KEY),good);
  const broken={getItem:()=>"{broken",setItem(){assert.fail("must not overwrite unreadable data")}};
  const read=favorites.createStore(broken);
  assert.equal(read.add(entry()).ok,false); assert.match(read.error(),/未被覆盖/);
});
test("saved images reject external fetches and paths outside the local illustration vault", () => {
  for(const image of ["https://external.example/a.jpg","javascript:alert(1)","data/illustrations/../private.jpg","data/mobile/scene.webp"])
    assert.equal(favorites.scene({...entry(),image}).image,"");
  assert.equal(favorites.scene(entry()).image,value.image);
});
test("delivered illustration survives pagination as one scene and remains attached to its favorite", () => {
  const previous=global.window;global.window={JiuzhouSceneFavorites:favorites};
  try {
    const engine=Object.assign(Object.create(WebVisualNovelEngine.prototype),{gameState:"PLAYING",currentFaction:"ming",currentStoryNodeId:"ming_act1",currentTurn:3,currentStep:1});
    const beat={speaker:"画卷",type:"illustration",text:"长画卷说明。".repeat(60),illustrationData:{relativePath:value.image,title:"城门",description:"长画卷说明。",apiKey:"fixture-private"}};
    engine.storyQueue=engine.normalizeAndChunkBeats([beat],90);
    assert.equal(engine.storyQueue.length,1);
    assert.equal(engine.storyQueue[0].illustrationData.relativePath,value.image);
    assert.equal(engine.getCurrentReadingScene().image,value.image);
    assert.ok(!JSON.stringify(engine.storyQueue).includes("fixture-private"));
    assert.equal(engine.normalizeAndChunkBeats([{...beat,illustrationData:{relativePath:"https://external.example/image.jpg"}}],90).some(b=>b.illustrationData),false);
  }finally{global.window=previous;}
});
test("scene projection reads only the current delivered beat and is disabled while generating", () => {
  const previous=global.window;global.window={JiuzhouSceneFavorites:favorites};
  try {
    const engine=Object.assign(Object.create(WebVisualNovelEngine.prototype),{gameState:"PLAYING",currentFaction:"ming",currentStoryNodeId:"ming_act1",currentTurn:3,currentStep:1,storyQueue:[{speaker:"旁白",text:"已交付正文"},{text:"下一段"}],apiConfig:{apiKey:"fixture-private"}});
    assert.equal(engine.getCurrentReadingScene().text,"已交付正文");
    assert.ok(!JSON.stringify(engine.getCurrentReadingScene()).includes("fixture-private"));
    engine.isAIGenerating=true;assert.equal(engine.getCurrentReadingScene(),null);
    engine.isAIGenerating=false;engine.gameState="TITLE";assert.equal(engine.getCurrentReadingScene(),null);
  }finally{global.window=previous;}
});
test("stable narrative rules and tool guidance keep action menus separate from delivered prose", () => {
  const previous=global.window; global.window={};
  try {
    const engine=Object.assign(Object.create(WebVisualNovelEngine.prototype),{expectedLength:5000,currentFaction:"ming",ideologyVector:{},apiConfig:{},apiHistory:[]});
    const payload=engine.buildDeepSeekCachePayload({text:"查阅粮册"},2,3,7,true);
    assert.match(payload.messages[0].content,/下一步可选行动只放在 choices/);
    assert.match(payload.messages[0].content,/不要在正文罗列、复述或提前预告选项/);
    const protocol=require("./harness/protocol.js");
    assert.match(protocol.tools.find(t=>t.function.name==="write_draft").function.description,/正文不要预告或罗列选项/);
    const normalized=protocol.normalizeStory({beats:[{text:"已交付"}],choices:[{text:"长选项".repeat(900)}]});
    assert.deepEqual(normalized.beats.map(beat=>beat.text),["已交付"]);
    assert.equal(normalized.choices[0].text,"长选项".repeat(900));
  }finally{global.window=previous;}
});

test("map visits use their own background without advancing the old story node or borrowing popup art", () => {
  const previous = global.WORLD_PRESETS;
  global.WORLD_PRESETS = {canonicalTrees:{qing:{nodes:{qing_act3_civil_backlash:{coords:"beijing:high"}}}}};
  try {
    const engine = Object.assign(Object.create(WebVisualNovelEngine.prototype), {
      currentFaction:"qing", currentStoryNodeId:"qing_act3_civil_backlash", currentCoords:"beijing:high",
      stageBackground:null, currentStep:1, storyQueue:[{type:"illustration", illustrationData:{id:"qing_night_raid"}}]
    });
    assert.equal(engine.getSceneIllustration().id, "qing_secret_letter");
    engine.currentCoords = "qing:mukden";
    assert.equal(engine.getSceneIllustration().id, "qing_campaign_map");
    assert.equal(engine.currentStoryNodeId, "qing_act3_civil_backlash");
    engine.stageBackground = {id:"qing_holding_cell"};
    assert.equal(engine.getSceneIllustration().id, "qing_holding_cell");
    engine.stageBackground = null;
    assert.equal(engine.getSceneIllustration().id, "qing_campaign_map");
  } finally {global.WORLD_PRESETS = previous;}
});
