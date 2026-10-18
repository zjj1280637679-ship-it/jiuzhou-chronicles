const strWithNewline = '{"beats":[{"speaker":"跑团GM","text":"第一行\n第二行"}]}';
console.log('Testing JSON with raw unescaped newline:');
try {
  JSON.parse(strWithNewline);
  console.log('Parsed successfully!');
} catch (e) {
  console.log('CAUGHT EXPECTED ERROR:', e.message);
}
