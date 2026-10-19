// Fixture only. The synchronous loop intentionally proves worker isolation.
self.JiuzhouPlugin = {
  name: "fixture-chaos",
  tools: ["test_throw", "test_hang", "test_echo"].map(name => ({
    type: "function", function: {name, description: "Test fixture", parameters: {type: "object", properties: {value: {type: "string"}}}}
  })),
  execute(name, args) {
    if (name === "test_throw") throw new Error("fixture plugin failed");
    if (name === "test_hang") { for (;;) {} }
    return {result: {ok: true, value: args.value || "echo"}};
  }
};
