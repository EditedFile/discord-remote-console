import { Collection } from "discord.js";
import { readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Logger } from "./logger.js";

export async function loadCommands(client) {
	try {
		client.commands = new Collection();

		const commandFiles = readdirSync(`${process.cwd()}/commands`).filter(file => file.endsWith(".js"));

		for (const file of commandFiles) {
			const filePath = `${process.cwd()}/commands/${file}`;
			const fileURL = pathToFileURL(filePath);
			const command = await import(fileURL.toString());

			if ("data" in command && "execute" in command) {
				client.commands.set(command.data.name, command);
			} else {
				Logger("warn", `COULD NOT LOAD ${file}: MISSING "data" OR "execute".`);
			}
		}

		Logger("event", `LOADED ${client.commands.size} COMMANDS`);
	} catch (error) {
		Logger("error", `ERROR LOADING COMMAND(S): ${error}`);
	}
}
