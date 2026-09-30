import { AttachmentBuilder, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { Logger } from "../utils/logger.js";
import { pathAutocomplete } from "../utils/pathAutocomplete.js";

const DISCORD_FILE_SIZE_LIMIT = 20 * 1024 * 1024;

export const data = new SlashCommandBuilder()
	.setName("download")
	.setDescription("Download a file from the machine as a Discord attachment")
	.addStringOption(option =>
		option
			.setName("path")
			.setDescription("Path to the file (relative to the current working directory or absolute)")
			.setRequired(true)
			.setAutocomplete(true)
	)
	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export const autocomplete = pathAutocomplete;

export async function execute(interaction) {
	try {
		if (interaction.channelId !== config.channel) {
			const embed = new EmbedBuilder()
				.setColor(0xFEE75C)
				.setTitle("Wrong Channel")
				.setDescription(`This command can only be used in the <#${config.channel}> channel.`)
				.setFooter({
					text: "discord-ssh",
					iconURL: interaction.client.user.displayAvatarURL()
				})
				.setTimestamp();

			return await interaction.reply({
				embeds: [embed],
				flags: 64
			});
		}

		await interaction.deferReply({ flags: 64 });

		const input = interaction.options.getString("path");
		const filePath = path.resolve(config.cwd, input);

		if (!fs.existsSync(filePath)) {
			const embed = new EmbedBuilder()
				.setColor(0xED4245)
				.setTitle("File Not Found")
				.setDescription(`No file exists at \`${filePath}\``)
				.setFooter({
					text: "discord-ssh",
					iconURL: interaction.client.user.displayAvatarURL()
				})
				.setTimestamp();

			return await interaction.editReply({
				embeds: [embed]
			});
		}

		const stat = fs.statSync(filePath);

		if (!stat.isFile()) {
			const embed = new EmbedBuilder()
				.setColor(0xED4245)
				.setTitle("Not a File")
				.setDescription(`\`${filePath}\` is a directory, not a file.`)
				.setFooter({
					text: "discord-ssh",
					iconURL: interaction.client.user.displayAvatarURL()
				})
				.setTimestamp();

			return await interaction.editReply({
				embeds: [embed]
			});
		}

		const tooBig = stat.size > DISCORD_FILE_SIZE_LIMIT;
		const sizeMB = (stat.size / (1024 * 1024)).toFixed(2);

		Logger("event", `Downloading file: ${filePath} (${sizeMB} MB)`);

		try {
			const attachment = new AttachmentBuilder(filePath);

			const embed = new EmbedBuilder()
				.setColor(tooBig ? 0xFEE75C : config.color)
				.setTitle("File Download")
				.setDescription(
					`**File:** \`${filePath}\`\n` +
					`**Size:** \`${sizeMB} MB\`` +
					(tooBig
						? `\n\n**Warning:** This file exceeds Discord's 20 MB limit. Attempting to send anyway - it will only work if the server is boosted.`
						: "")
				)
				.setFooter({
					text: "discord-ssh",
					iconURL: interaction.client.user.displayAvatarURL()
				})
				.setTimestamp();

			await interaction.editReply({
				embeds: [embed],
				files: [attachment]
			});

			Logger("event", `Sent file: ${filePath}`);
		} catch (error) {
			Logger("error", `Failed to send file ${filePath}: ${error}`);

			const isTooLarge =
				error.code === 40005 ||
				error.status === 413 ||
				`${error.message}`.toLowerCase().includes("too large");

			const errorEmbed = new EmbedBuilder()
				.setColor(0xED4245)
				.setTitle(isTooLarge ? "File Too Large" : "Upload Failed")
				.setDescription(
					isTooLarge
						? `\`${path.basename(filePath)}\` (\`${sizeMB} MB\`) is too big to send.\n\nDiscord's limit is 20 MB, or higher if the server is boosted.`
						: `Failed to send \`${path.basename(filePath)}\`\n\n**Error:**\n\`\`\`${error.message}\`\`\``
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
		Logger("error", `Error in download command: ${error}`);
		const errorEmbed = new EmbedBuilder()
			.setColor(0xED4245)
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
