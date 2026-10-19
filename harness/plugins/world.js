"use strict";
self.JiuzhouPlugin = {
  name: "world",
  tools: self.JiuzhouHarnessProtocol.tools.filter(t => t.function.name === "read_world"),
  execute(name, args, context) {
    if (name !== "read_world") throw new Error("unknown_tool");
    return {result: {ok: true, world: context.world || {}}};
  }
};
