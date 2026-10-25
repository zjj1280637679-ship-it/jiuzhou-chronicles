// Architecture boundary fixture; no network or engine references.
const typedArguments = {type: "object", additionalProperties: false, required: ["payload"], properties: {
  payload: {type: "object", additionalProperties: false, required: ["mode", "values"], properties: {
    mode: {type: "string", enum: ["read", "write"]}, values: {type: "array", minItems: 1, items: {type: "integer", minimum: 0}}
  }}
}};
self.JiuzhouPlugin = {
  tools: ["read_world", "inspect_context", "invalid_receipt", "echo_typed"].map(name => ({type: "function", function: {
    name, description: "Contract fixture", parameters: name === "echo_typed" ? typedArguments : {type: "object", properties: {}, additionalProperties: false}
  }})),
  execute(name, args, context) {
    if (name === "inspect_context") return {result: {ok: true, context}};
    if (name === "invalid_receipt") return {result: {ok: "yes"}, delivery: {beats: [{text: "无效回执不能交付"}]}};
    if (name === "echo_typed") return {result: {ok: true, payload: args.payload}};
    return {result: {ok: true, world: context.world || {}}, delivery: {beats: [{text: "非交付工具不能提交正文"}]}};
  }
};
