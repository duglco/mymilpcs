const fs = require("fs");

const file = "./bases.json";
const bases = JSON.parse(fs.readFileSync(file, "utf8"));

for (const b of bases) {
  if (b.state) b.state = b.state.trim().toUpperCase();
}

fs.writeFileSync(file, JSON.stringify(bases, null, 2));
console.log("✅ States normalized to uppercase in", file);
