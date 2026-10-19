const fixtureStart = Date.now();
while (Date.now() - fixtureStart < 80) { /* delay this worker, not its parent */ }
self.JiuzhouPlugin = {
  name: "fixture-slow-world",
  tools: self.JiuzhouHarnessProtocol.tools.filter(tool => tool.function.name === "read_world"),
  execute(_name, _args, context) { return {result: {ok: true, world: context.world}}; }
};
