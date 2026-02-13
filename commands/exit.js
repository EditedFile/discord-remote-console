import { exec } from "child_process";
import { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { promisify } from "util";
import { config } from "../config.js";
import { Logger } from "../utils/logger.js";

const execPromise = promisify(exec);

export const data = new SlashCommandBuilder()
	.setName("exit")
	.setDescription("Stop a screen session and delete its channel")
	.addStringOption(option =>
		option
			.setName("session")
			.setDescription("Screen session name (leave empty to use current channel)")
			.setRequired(false)
			.setAutocomplete(true)
	)
	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function autocomplete(interaction) {
	try {
		const { stdout } = await execPromise("screen -ls");
		const sessionRegex = /(\d+\.\S+)/g;
		const sessions = stdout.match(sessionRegex) || [];

		const choices = sessions.map(session => ({
			name: session,
			value: session,
		}));

		await interaction.respond(choices.slice(0, 25)); // Discord limit is 25 choices
	} catch (error) {
		await interaction.respond([]);
	}
}

export async function execute(interaction) {
	try {
		await interaction.deferReply({ flags: 64 }); // 64 = ephemeral flag

		let sessionName = interaction.options.getString("session");
		let channelToDelete = null;

		if (!sessionName) {
			const channel = interaction.channel;
			if (channel.name.startsWith("screen-")) {
				sessionName = channel.topic || channel.name.replace("screen-", "").replace(/(\d+)([A-Za-z]+)/, "$1.$2");
				channelToDelete = channel;
			} else {
				const embed = new EmbedBuilder()
					.setColor(0xFEE75C) // Yellow color
					.setTitle("Invalid Channel")
					.setDescription("No session specified and current channel is not a screen session channel.")
					.setFooter({
						text: "discord-ssh",
						iconURL: interaction.client.user.displayAvatarURL()
					})
					.setTimestamp();

				return await interaction.editReply({
					embeds: [embed]
				});
			}
		} else {
			const channelName = `screen-${sessionName.replace(/\./g, "")}`;
			channelToDelete = interaction.guild.channels.cache.find(
				c => c.name === channelName
			);
		}

		try {
			await execPromise(`screen -S ${sessionName} -X quit`);
			Logger("event", `Stopped screen session: ${sessionName}`);

			const embed = new EmbedBuilder()
				.setColor(config.color)
				.setTitle("Session Stopped")
				.setDescription(
					`Screen session \`${sessionName}\` has been stopped.\n\n` +
					(channelToDelete ? `Channel will be deleted in \`5 seconds\`` : `No associated channel found`)
				)
				.setFooter({
					text: "discord-ssh",
					iconURL: interaction.client.user.displayAvatarURL()
				})
				.setTimestamp();

			await interaction.editReply({
				embeds: [embed]
			});

			if (channelToDelete) {
				setTimeout(async () => {
					try {
						await channelToDelete.delete();
						Logger("event", `Deleted channel: ${channelToDelete.name}`);
					} catch (error) {
						Logger("error", `Error deleting channel: ${error}`);
					}
				}, 5000);
			}
		} catch (error) {
			Logger("error", `Error stopping screen session: ${error}`);
			const errorEmbed = new EmbedBuilder()
				.setColor(0xED4245) // Red color
				.setTitle("Session Stop Failed")
				.setDescription(
					`Failed to stop screen session \`${sessionName}\`\n\n` +
					`**Error:**\n\`\`\`${error.message}\`\`\`\n\n` +
					`The session may not exist or may already be stopped.`
				)
				.setFooter({
					text: "discord-ssh",
					iconURL: interaction.client.user.displayAvatarURL()
				})
				.setTimestamp();

			await interaction.editReply({
				embeds: [errorEmbed]
			});
		}
	} catch (error) {
		Logger("error", `Error in exit command: ${error}`);
		const errorEmbed = new EmbedBuilder()
			.setColor(0xED4245) // Red color
			.setTitle("Command Error")
			.setDescription(`An error occurred:\n\`\`\`${error.message}\`\`\``)
			.setFooter({
				text: "discord-ssh",
				iconURL: interaction.client.user.displayAvatarURL()
			})
			.setTimestamp();

		if (interaction.deferred) {
			await interaction.editReply({
				embeds: [errorEmbed]
			});
		} else {
			await interaction.reply({
				embeds: [errorEmbed],
				flags: 64
			});
		}
	}
}
