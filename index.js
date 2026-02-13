import { Client, GatewayIntentBits } from "discord.js";
import "dotenv/config";
import { loadCommands } from "./utils/loadCommands.js";
import loadEvents from "./utils/loadEvents.js";
import { Logger } from "./utils/logger.js";

try {
	const client = new Client({
		allowedMentions: {
			parse: ["users", "roles"],
			repliedUser: false,
		},
		intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent
        ],
	});

	await loadCommands(client);
	await loadEvents(client);


	await client.login(process.env.TOKEN);
} catch (error) {
	Logger("error", `ERROR WHILE STARTING THE BOT: ${error}`);
	throw error;
}

process.on("unhandledRejection", (reason) => {
	return Logger("error", `Unhandled Rejection: ${reason}`);
});

process.on("uncaughtException", (err) => {
	return Logger("error", `Uncaught Exception: ${err}`);
});
