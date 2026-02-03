#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const MAINNET_URL = "https://api.siliconflow.cn/v1";
const KEYS_PATH = path.join(process.cwd(), "scripts", "sf-keys.json");

// 神兽配置列表
const BEASTS = [
  {
    name: "貔貅",
    prompt:
      "Pixiu the mythical wealth beast, Chinese ink wash painting, monochrome black and white, bold brush strokes, lion-like body with dragon head, single horn, fierce yet auspicious expression, spiral cloud patterns, sitting posture, no background, pure ink art style",
  },
  {
    name: "麒麟",
    prompt:
      "Qilin the benevolent unicorn beast, Chinese ink wash painting, monochrome black and white, dragon head with deer antlers, ox tail, horse hooves, flame patterns on body, majestic and peaceful, no background, pure ink art style",
  },
  {
    name: "青龙",
    prompt:
      "Azure Dragon Qinglong, Chinese ink wash painting, monochrome black and white, serpentine dragon body, five claws, flowing whiskers, spiral cloud patterns, dynamic coiling posture, no background, pure ink art style",
  },
  {
    name: "白虎",
    prompt:
      "White Tiger Baihu, Chinese ink wash painting, monochrome black and white, fierce tiger form with mystical patterns, sharp claws and teeth, mountain king aura, spiral stripes, sitting posture, no background, pure ink art style",
  },
  {
    name: "朱雀",
    prompt:
      "Vermilion Bird Zhuque, Chinese ink wash painting, monochrome black and white, phoenix-like mythical bird, flowing tail feathers, flame patterns, elegant and powerful wings spread, no background, pure ink art style",
  },
  {
    name: "玄武",
    prompt:
      "Black Tortoise Xuanwu, Chinese ink wash painting, monochrome black and white, turtle body with serpent tail, ancient and wise, spiral shell patterns, coiled snake, no background, pure ink art style",
  },
  {
    name: "白泽",
    prompt:
      "Baize the all-knowing beast, Chinese ink wash painting, monochrome black and white, goat-like with two horns, wise gentle eyes, flowing beard, scholarly aura, spiral patterns, sitting posture, no background, pure ink art style",
  },
];

async function generateBeast(key, beast, keyIndex) {
  console.log(`\n[Key ${keyIndex + 1}] 生成 ${beast.name}...`);

  try {
    const response = await fetch(`${MAINNET_URL}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: beast.prompt,
        model: "Qwen/Qwen-Image",
        image_size: "1024x1024",
        response_format: "b64_json",
      }),
    });

    const payload = await response.json();
    const imageData = payload.data?.[0] || payload.images?.[0];

    if (imageData) {
      let imageBuffer;
      if (imageData.b64_json) {
        imageBuffer = Buffer.from(imageData.b64_json, "base64");
      } else if (imageData.url) {
        const imgRes = await fetch(imageData.url);
        const arrayBuffer = await imgRes.arrayBuffer();
        imageBuffer = Buffer.from(arrayBuffer);
      }

      if (imageBuffer) {
        const outputPath = path.join(process.cwd(), "output", `beast-${beast.name}-raw.png`);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, imageBuffer);
        console.log(`✅ ${beast.name} 生成成功！`);
        return outputPath;
      }
    }

    console.log(`❌ ${beast.name} 生成失败`);
    return null;
  } catch (err) {
    console.log(`❌ ${beast.name} 错误: ${err.message}`);
    return null;
  }
}

async function editSeal(key, imagePath, beastName, keyIndex) {
  console.log(`\n[Key ${keyIndex + 1}] 编辑 ${beastName} 印章...`);

  try {
    // 读取原图并转为base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString("base64");

    const response = await fetch(`${MAINNET_URL}/images/edits`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "Qwen/Qwen-Image-Edit",
        image: base64Image,
        prompt: `Modify the red seal/stamp in the corner to contain the Chinese characters "${beastName}". Keep the traditional seal style and position. Maintain the ink wash painting style of the beast.`,
        response_format: "b64_json",
      }),
    });

    const payload = await response.json();
    const imageData = payload.data?.[0] || payload.images?.[0];

    if (imageData) {
      let outputBuffer;
      if (imageData.b64_json) {
        outputBuffer = Buffer.from(imageData.b64_json, "base64");
      } else if (imageData.url) {
        const imgRes = await fetch(imageData.url);
        const arrayBuffer = await imgRes.arrayBuffer();
        outputBuffer = Buffer.from(arrayBuffer);
      }

      if (outputBuffer) {
        const outputPath = path.join(process.cwd(), "output", `beast-${beastName}-final.png`);
        fs.writeFileSync(outputPath, outputBuffer);
        console.log(`✅ ${beastName} 印章编辑完成！`);
        return outputPath;
      }
    }

    console.log(`❌ ${beastName} 印章编辑失败: ${JSON.stringify(payload).substring(0, 200)}`);
    return null;
  } catch (err) {
    console.log(`❌ ${beastName} 编辑错误: ${err.message}`);
    return null;
  }
}

async function main() {
  const keysData = fs.readFileSync(KEYS_PATH, "utf8");
  const keys = JSON.parse(keysData);

  console.log(`准备生成 ${BEASTS.length} 个神兽形象...`);
  console.log("神兽列表:", BEASTS.map((b) => b.name).join(", "));

  let keyIndex = 0;
  const results = [];

  for (const beast of BEASTS) {
    // 使用轮询密钥
    const key = keys[keyIndex % keys.length].key;

    // 1. 生成神兽
    const rawPath = await generateBeast(key, beast, keyIndex % keys.length);

    if (rawPath) {
      // 2. 编辑印章
      // 使用下一个密钥进行编辑（避免同一密钥连续请求）
      const editKey = keys[(keyIndex + 1) % keys.length].key;
      const finalPath = await editSeal(editKey, rawPath, beast.name, (keyIndex + 1) % keys.length);

      if (finalPath) {
        results.push({ name: beast.name, final: finalPath });
      }
    }

    keyIndex += 2;
  }

  console.log("\n🎉 生成完成！");
  console.log("成功生成的神兽:");
  results.forEach((r) => console.log(`  - ${r.name}: ${r.final}`));
}

main().catch(console.error);
