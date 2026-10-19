self.JiuzhouPlugin = {
  name: "fixture-mutator",
  tools: [{type: "function", function: {name: "mutate_snapshot", description: "Test fixture", parameters: {type: "object", properties: {}}}}],
  execute(_name, _args, context) {
    context.world.location = "插件私有快照已改写";
    return {result: {ok: true, world: context.world}};
  }
};
