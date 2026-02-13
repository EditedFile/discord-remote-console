import { Logger } from "../../utils/logger.js";

export async function interactionCreate(client, interaction) {
	try {
		if (interaction.isChatInputCommand()) {
			const command = client.commands.get(interaction.commandName);

			if (!command) {
				Logger("warn", `COMMAND ${interaction.commandName} NOT FOUND.`);
				return;
			}

			try {
				await command.execute(interaction);
			} catch (error) {
				Logger("error", `ERROR RUNNING ${interaction.commandName}: ${error}`);
				const errorMessage = { content: "❌ There was an error executing this command!", ephemeral: true };
				
				if (interaction.replied || interaction.deferred) {
					await interaction.followUp(errorMessage);
				} else {
					await interaction.reply(errorMessage);
				}
			}
		}
		else if (interaction.isAutocomplete()) {
			const command = client.commands.get(interaction.commandName);

			if (!command || !command.autocomplete) {
				return;
			}

			try {
				await command.autocomplete(interaction);
			} catch (error) {
				Logger("error", `AUTOCOMPLETE ERROR FOR ${interaction.commandName}: ${error}`);
			}
		}
	} catch (error) {
		Logger("error", `INTERACTIONCREATE ERROR: ${error}`);
	}
}
