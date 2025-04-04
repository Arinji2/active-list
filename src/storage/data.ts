import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ActiveUser {
  status: "active" | "inactive";
  joinedAt: string;
  pendingCheck: boolean;
}

const filePath = path.join(__dirname, "data.json");

export function readData(): Record<string, ActiveUser> {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function writeData(data: Record<string, ActiveUser>): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}
