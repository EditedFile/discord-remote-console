import { ActivityType, ChannelType } from "discord.js";
import { config } from "../../config.js";
import { Logger } from "../../utils/logger.js";
import { registerCommands } from "../../utils/registerCommands.js";

export async function clientReady(client) {
	try {
		Logger("ready", `LOGGED IN AS ${client.user?.tag} | (ID: ${client.user?.id})`);
		
		await registerCommands(client);
		
		for (const [, guild] of client.guilds.cache) {
			const category = guild.channels.cache.find(
				c => c.type === ChannelType.GuildCategory && c.name === "DISCORD SSH BOT"
			);
			
			if (category) {
				const mainTerminal = guild.channels.cache.find(
					c => c.name === "main-terminal" && c.parentId === category.id
				);
				
				if (mainTerminal) {
					config.channel = mainTerminal.id;
					config.category_id = category.id;
					Logger("ready", `Restored main-terminal channel: ${mainTerminal.id}`);
				}
			}
		}
		
		client.user?.setActivity("/setup", {
			type: ActivityType.Custom
		});
		
	} catch (error) {
		Logger("error", `READY EVENT ERROR: ${error}`);
	}
}
