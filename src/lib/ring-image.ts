import { existsSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

import type { UsageSnapshot } from "./usage";

const RENDER_SIZE = 288;
const OUTPUT_SIZE = 144;

const FONT_CANDIDATES = [
	"/System/Library/Fonts/SFNSRounded.ttf",
	"/System/Library/Fonts/SFNS.ttf",
	"/System/Library/Fonts/Supplemental/Arial Bold.ttf",
	"/System/Library/Fonts/Supplemental/Arial.ttf",
];

/**
 * Parametric SVG activity rings using stroke-dasharray — not raster PNG assets.
 */
export function buildRingSvg(snapshot: UsageSnapshot, size = RENDER_SIZE): string {
	const { colors } = snapshot;
	const cx = size / 2;
	const cy = size / 2;
	// Nested flush: no gap between rings (edges touch).
	const margin = size * 0.12;
	const outerStroke = size * 0.058;
	const middleStroke = size * 0.058;
	const innerStroke = size * 0.058;

	const outerR = size / 2 - margin;
	const middleR = outerR - (outerStroke + middleStroke) / 2;
	const innerR = middleR - (middleStroke + innerStroke) / 2;

	const centerFontSize = snapshot.centerText.length <= 3 ? size * 0.13 : size * 0.1;

	let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;
	svg += `<rect x="${margin * 0.55}" y="${margin * 0.55}" width="${size - margin * 1.1}" height="${size - margin * 1.1}" rx="${size * 0.153}" fill="${colors.background}"/>`;

	svg += progressRing(cx, cy, outerR, outerStroke, colors.track, snapshot.outerColor, snapshot.outerPercent);
	svg += progressRing(cx, cy, middleR, middleStroke, colors.track, snapshot.middleColor, snapshot.middlePercent);
	svg += progressRing(cx, cy, innerR, innerStroke, colors.track, colors.inner, snapshot.innerPercent);

	svg += `<text x="${cx}" y="${cy + centerFontSize * 0.36}" text-anchor="middle" fill="${colors.text}" font-family="SF Pro Rounded, SF Pro Display, Helvetica Neue, Arial, sans-serif" font-size="${centerFontSize}" font-weight="600">${escapeXml(snapshot.centerText)}</text>`;

	if (snapshot.contextLoaded) {
		const dot = size * 0.056;
		const dotX = size - margin * 1.4;
		const dotY = margin * 1.1;
		svg += `<circle cx="${dotX}" cy="${dotY}" r="${dot / 2}" fill="${colors.dot}"/>`;
	}

	svg += "</svg>";
	return svg;
}

function progressRing(
	cx: number,
	cy: number,
	r: number,
	strokeWidth: number,
	trackColor: string,
	progressColor: string,
	percent: number,
): string {
	const clamped = Math.min(Math.max(percent, 0), 100);
	const circumference = 2 * Math.PI * r;
	const dashOffset = circumference * (1 - clamped / 100);

	return `
		<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${trackColor}" stroke-width="${strokeWidth}" />
		<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${progressColor}" stroke-width="${strokeWidth}"
			stroke-linecap="round"
			stroke-dasharray="${circumference.toFixed(3)}"
			stroke-dashoffset="${dashOffset.toFixed(3)}"
			transform="rotate(-90 ${cx} ${cy})" />
	`;
}

export function renderRingImage(snapshot: UsageSnapshot): string {
	const svg = buildRingSvg(snapshot, RENDER_SIZE);
	const fontFiles = FONT_CANDIDATES.filter((path) => existsSync(path)).slice(0, 1);

	const resvg = new Resvg(svg, {
		fitTo: { mode: "width", value: OUTPUT_SIZE },
		font: {
			fontFiles: fontFiles.length > 0 ? fontFiles : undefined,
			loadSystemFonts: false,
			defaultFontFamily: "Arial",
		},
	});

	const png = resvg.render().asPng();
	return `data:image/png;base64,${png.toString("base64")}`;
}

function escapeXml(value: string): string {
	return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
