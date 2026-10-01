// เรียก Pixel Lab MCP (https://api.pixellab.ai/mcp) ผ่าน HTTP เพื่อเจนหรือเจนแอสเซตซ้ำ
//
// ต้องตั้ง PIXELLAB_API_TOKEN ใน .env (ถูก ignore แล้ว ห้ามใส่ token ในโค้ด)
//
//   npm run pixellab -- list                      รายชื่อเครื่องมือ
//   npm run pixellab -- call <tool> '<json>'      เรียกเครื่องมือด้วย arguments ที่ให้
//   npm run pixellab -- gen <ASSET-ID>            เรียกเครื่องมือเจนของแอสเซตนั้นด้วย arguments ใน assets-manifest.json
//   npm run pixellab -- fetch <ASSET-ID> <id>     ดึงผลที่เจนเสร็จแล้วลง assets-src/pixellab/<ASSET-ID>/ (ไม่ใช้เครดิต)
//
// ลำดับงานต่อชิ้น: gen -> รอจนเสร็จ -> fetch -> เปิดดูภาพใน assets-src/pixellab/<ASSET-ID>/ -> npm run assets:build
// fetch เขียน source.json (เครื่องมือ arguments และ id ที่ใช้เจน) ซึ่ง assets:build นำไปลง assets-manifest.json
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const URL_MCP = "https://api.pixellab.ai/mcp";
const MANIFEST = new URL("../public/assets/assets-manifest.json", import.meta.url);

function authHeader() {
  const token = (process.env.PIXELLAB_API_TOKEN ?? "").trim();
  if (!token) {
    console.error("ไม่พบ PIXELLAB_API_TOKEN (ใส่ในไฟล์ .env ตามตัวอย่างใน .env.example)");
    process.exit(1);
  }
  return /^bearer /i.test(token) ? token : `Bearer ${token}`;
}

let session;

async function rpc(payload, authorize) {
  const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  if (authorize) headers.Authorization = authHeader();
  if (session) headers["Mcp-Session-Id"] = session;
  const res = await fetch(URL_MCP, { method: "POST", headers, body: JSON.stringify(payload) });
  session = res.headers.get("mcp-session-id") ?? session;
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  // คำตอบเป็น JSON ตรง ๆ หรือ SSE (บรรทัด "data: {...}")
  const messages = body.trimStart().startsWith("{")
    ? [JSON.parse(body)]
    : body.split("\n").filter((l) => l.startsWith("data:")).map((l) => JSON.parse(l.slice(5)));
  return messages.find((m) => m.id === payload.id);
}

async function callTool(name, args, quiet = false) {
  const reply = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } }, true);
  if (!reply || reply.error) throw new Error(`เรียก ${name} ไม่สำเร็จ: ${JSON.stringify(reply?.error ?? reply)}`);
  const texts = [];
  for (const part of reply.result.content ?? []) {
    // รูปที่ส่งกลับเป็น base64 ไม่พิมพ์ทั้งก้อน
    const line = part.type === "text" ? part.text : `[${part.type} ${part.mimeType ?? ""} ${part.data?.length ?? 0} bytes base64]`;
    if (part.type === "text") texts.push(part.text);
    if (!quiet) console.log(line);
  }
  if (reply.result.isError) process.exit(1);
  return texts.join("\n");
}

const findAsset = (id) => {
  const asset = JSON.parse(readFileSync(MANIFEST, "utf8")).assets.find((a) => a.id === id);
  if (!asset) {
    console.error(`ไม่พบแอสเซต ${id} ใน assets-manifest.json`);
    process.exit(1);
  }
  return asset;
};

async function download(url, file, authorize) {
  const res = await fetch(url, authorize ? { headers: { Authorization: authHeader() } } : {});
  if (!res.ok) throw new Error(`ดาวน์โหลด ${url} ไม่สำเร็จ: HTTP ${res.status}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(`  บันทึก ${file}`);
}

/** ดึงไฟล์ผลลัพธ์ตามชนิดเครื่องมือ: ตัวละคร = ภาพรายทิศ, ไทล์เซต = แผ่นไทล์ + metadata, ภาพเดี่ยว = south.png (ไอคอน = image.png) */
async function fetchAsset(asset, pixellabId) {
  const dir = new URL(`../assets-src/pixellab/${asset.id}/`, import.meta.url);
  mkdirSync(dir, { recursive: true });
  const out = (name) => new URL(name, dir).pathname;
  const tool = asset.pixellab.fetchTool;
  if (tool === "get_character") {
    const text = await callTool(tool, { character_id: pixellabId, include_preview: false }, true);
    if (!/^status: completed/m.test(text)) throw new Error(`ยังไม่เสร็จ:\n${text.split("\n").slice(0, 3).join("\n")}`);
    for (const [, direction, url] of text.matchAll(/^\s+(south|north|east|west): (https\S+)/gm)) await download(url, out(`${direction}.png`), false);
  } else if (tool === "get_topdown_tileset") {
    const text = await callTool(tool, { tileset_id: pixellabId }, true);
    if (!/^status: completed/m.test(text)) throw new Error(`ยังไม่เสร็จ:\n${text.split("\n").slice(0, 3).join("\n")}`);
    await download(`${URL_MCP}/tilesets/${pixellabId}/image?inline=true`, out("tileset.png"), true);
    await download(`${URL_MCP}/tilesets/${pixellabId}/metadata`, out("metadata.json"), true);
  } else if (tool === "get_image") {
    const text = await callTool(tool, { job_id: pixellabId }, true);
    if (!/^status: completed/m.test(text)) throw new Error(`ยังไม่เสร็จ:\n${text.split("\n").slice(0, 3).join("\n")}`);
    await download(`${URL_MCP}/images/${pixellabId}/download`, out(asset.kind === "icon" ? "image.png" : "south.png"), true);
  } else {
    throw new Error(`ยังไม่รองรับการดึงผลของ ${tool}`);
  }
  // เก็บ rejected และ postprocess ที่บันทึกไว้ด้วยมือ ถ้า id เดิม
  const sourceFile = out("source.json");
  const previous = existsSync(sourceFile) ? JSON.parse(readFileSync(sourceFile, "utf8")) : {};
  const source = {
    ...(previous.id === pixellabId ? previous : { rejected: previous.rejected }),
    tool: asset.pixellab.tool,
    arguments: asset.pixellab.arguments,
    fetchTool: tool,
    id: pixellabId,
    generatedAt: previous.id === pixellabId ? previous.generatedAt : new Date().toISOString(),
  };
  writeFileSync(sourceFile, `${JSON.stringify(source, null, 2)}\n`);
  console.log(`  บันทึก ${sourceFile}`);
}

const [command, target, json] = process.argv.slice(2);

if (command === "list") {
  const reply = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, false);
  for (const tool of reply.result.tools) console.log(tool.name, "-", (tool.description ?? "").trim().split("\n")[0].slice(0, 110));
} else if (command === "call" && target) {
  await callTool(target, json ? JSON.parse(json) : {});
} else if (command === "gen" && target) {
  const asset = findAsset(target);
  console.log(`${asset.id} ${asset.name} -> ${asset.pixellab.tool}`);
  await callTool(asset.pixellab.tool, asset.pixellab.arguments);
} else if (command === "fetch" && target && json) {
  const asset = findAsset(target);
  console.log(`${asset.id} ${asset.name} <- ${asset.pixellab.fetchTool} ${json}`);
  await fetchAsset(asset, json);
} else {
  console.error("ใช้: npm run pixellab -- list | call <tool> '<json>' | gen <ASSET-ID> | fetch <ASSET-ID> <pixellab-id>");
  process.exit(1);
}
