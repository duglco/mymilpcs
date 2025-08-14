// Normalize branch names in src/bases.json to proper case (title case)
const fs = require("fs");
const path = require("path");

// Point to your data file
const file = path.join(__dirname, "bases.json");

// 1) Backup once per run
const backup = file + ".bak";
if (!fs.existsSync(backup)) {
  fs.copyFileSync(file, backup);
  console.log("📦 Backup created:", backup);
}

// 2) Load, transform, save
const bases = JSON.parse(fs.readFileSync(file, "utf8"));

function titleCase(str) {
  return str
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

for (const b of bases) {
  if (b && typeof b === "object" && "branch" in b && b.branch != null) {
    // Trim and title-case the branch name
    b.branch = titleCase(String(b.branch).trim());
  }
}

fs.writeFileSync(file, JSON.stringify(bases, null, 2));
console.log("✅ Branch names normalized in", file);
