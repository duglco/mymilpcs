// Combined script: fixes states to 2-letter uppercase & maps branches to desired names
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "bases.json");

// Backup first time
const backup = file + ".bak";
if (!fs.existsSync(backup)) {
  fs.copyFileSync(file, backup);
  console.log("📦 Backup created:", backup);
}

// Branch abbreviation → full name mapping
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

// Load JSON
const bases = JSON.parse(fs.readFileSync(file, "utf8"));

// Process each record
for (const b of bases) {
  if (b && typeof b === "object") {
    // --- Fix State ---
    if ("state" in b && b.state != null) {
      b.state = String(b.state).trim().toUpperCase();
    }

    // --- Fix Branch ---
    if ("branch" in b && b.branch != null) {
      const key = String(b.branch).replace(/\s+/g, "").toUpperCase();
      if (branchMap[key]) {
        b.branch = branchMap[key];
      }
    }
  }
}

// Save updated file
fs.writeFileSync(file, JSON.stringify(bases, null, 2));
console.log("✅ States and branches normalized in", file);
