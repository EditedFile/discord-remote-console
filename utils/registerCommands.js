import { REST, Routes } from "discord.js";
import { readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Logger } from "./logger.js";

export async function registerCommands(client) {
	try {
		const commands = [];
		const commandFiles = readdirSync(`${process.cwd()}/commands`).filter(file => file.endsWith(".js"));

		for (const file of commandFiles) {
			const filePath = `${process.cwd()}/commands/${file}`;
			const fileURL = pathToFileURL(filePath);
			const command = await import(fileURL.toString());

			if ("data" in command) {
				commands.push(command.data.toJSON());
			}
		}

		const rest = new REST().setToken(process.env.TOKEN);

		Logger("info", `STARTED LOADING/RELAODING ${commands.length} SLASH COMMANDS.`);

		const data = await rest.put(
			Routes.applicationCommands(client.user.id),
			{ body: commands },
		);

		Logger("info", `LOADED/RELOADED ${data.length} SLASH COMMANDS.`);
	} catch (error) {
		Logger("error", `Error registering commands: ${error}`);
	}
}
