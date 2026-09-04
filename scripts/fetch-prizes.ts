/**
 * The prize photos, cut out of the white sheet Noctua shoots on so each cooler stands on the
 * podium the way a bean does. Copied into the repo rather than hotlinked, so the board still
 * draws on a LAN with no way out.
 *
 * The source file per prize is named here because only a person can say which of a product's ten
 * shots is the one worth standing on a podium.
 */
import { Jimp } from "jimp";
import { cutWhiteBackground } from "../src/cutout";
import type { TournamentEvent } from "../src/types";

const CDN = "https://cdn.noctua.at/media";
const OUT = "site/img/prizes";
const WIDEST = 520;

const SHOTS: Record<string, string> = {
  "nh-d15-g2.png": "nh_d15_g2_1.jpg",
  "nh-u12a-chromax-black.png": "nh_u12a_chromax_black_1.jpg",
  "nh-d12l.png": "nh_d12l_1.jpg",
};

const event = (await Bun.file("data/event.json").json()) as TournamentEvent;
const wanted = (event.prizes ?? []).map((prize) => prize.image);

for (const name of wanted) {
  const shot = SHOTS[name];
  if (!shot) {
    console.error(`No source shot named for ${name}; add it to SHOTS.`);
    process.exit(1);
  }

  const response = await fetch(`${CDN}/${shot}`);
  if (!response.ok) {
    console.error(`${CDN}/${shot} returned ${response.status}`);
    process.exit(1);
  }

  const image = await Jimp.read(Buffer.from(await response.arrayBuffer()));
  image.scaleToFit({ w: WIDEST, h: WIDEST });
  cutWhiteBackground(image.bitmap);
  await image.write(`${OUT}/${name}` as `${string}.png`);
  console.log(`${name} ${image.bitmap.width}x${image.bitmap.height}`);
}
