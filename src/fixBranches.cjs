// Map branch abbreviations to full names
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "bases.json");

// Create a backup the first time you run this
const backup = file + ".bak";
if (!fs.existsSync(backup)) {
  fs.copyFileSync(file, backup);
  console.log("📦 Backup created:", backup);
}

// Mapping from abbreviations → desired output
const branchMap = {
  "USA": "Army",
  "USAF": "AirForce",
  "USN": "Navy",
  "USMC": "USMC",
  "USAR": "USAR",
  "AFR": "AFR",
  "USNR": "USNR",
  "USMCR": "USMCR",
  "ARMYNATIONALGUARD": "ARNG",
  "WHS": "WHS",
  "AIRNATIONALGUARD": "ANG"
};

const bases = JSON.parse(fs.readFileSync(file, "utf8"));

for (const b of bases) {
  if (b && typeof b === "object" && "branch" in b && b.branch != null) {
    // Normalize key to uppercase with no spaces for mapping
    const key = String(b.branch).replace(/\s+/g, "").toUpperCase();
    if (branchMap[key]) {
      b.branch = branchMap[key];
    }
  }
}

fs.writeFileSync(file, JSON.stringify(bases, null, 2));
console.log("✅ Branch names updated based on mapping in", file);
