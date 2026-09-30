import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

const MAX_AUTOCOMPLETE_LENGTH = 100;

export async function pathAutocomplete(interaction) {
	try {
		const focused = interaction.options.getFocused();

		let dir;
		let prefix;
		let base;

		if (!focused || focused.endsWith("/")) {
			dir = path.resolve(config.cwd, focused || ".");
			prefix = "";
			base = focused || "";
		} else {
			const resolved = path.resolve(config.cwd, focused);
			dir = path.dirname(resolved);
			prefix = path.basename(resolved);
			base = focused.slice(0, focused.length - prefix.length);
		}

		if (!fs.existsSync(dir)) return await interaction.respond([]);
		if (!fs.statSync(dir).isDirectory()) return await interaction.respond([]);

		const entries = fs.readdirSync(dir, { withFileTypes: true })
			.filter(entry => entry.name.startsWith(prefix))
			.sort((a, b) => {
				if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
				return a.name.localeCompare(b.name);
			});

		const choices = [];
		for (const entry of entries) {
			const display = base + entry.name + (entry.isDirectory() ? "/" : "");
			if (display.length > MAX_AUTOCOMPLETE_LENGTH) continue;
			choices.push({ name: display, value: display });
			if (choices.length >= 25) break;
		}

		await interaction.respond(choices);
	} catch (error) {
		await interaction.respond([]).catch(() => {});
	}
}
