import { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { Logger } from "../utils/logger.js";
import { pathAutocomplete } from "../utils/pathAutocomplete.js";

export const data = new SlashCommandBuilder()
	.setName("upload")
	.setDescription("Upload a file attachment to the machine")
	.addAttachmentOption(option =>
		option
			.setName("file")
			.setDescription("File to upload")
			.setRequired(true)
	)
	.addStringOption(option =>
		option
			.setName("path")
			.setDescription("Destination directory or file path (defaults to the current working directory)")
			.setRequired(false)
			.setAutocomplete(true)
	)
	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export const autocomplete = pathAutocomplete;

function formatSize(bytes) {
	if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
	if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
	if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
	return `${bytes} B`;
}

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

		const attachment = interaction.options.getAttachment("file");
		const input = interaction.options.getString("path");

		let destPath;

		if (input) {
			const resolved = path.resolve(config.cwd, input);
			if (input.endsWith("/") || (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory())) {
				destPath = path.join(resolved, attachment.name);
			} else {
				destPath = resolved;
			}
		} else {
			destPath = path.join(config.cwd, attachment.name);
		}

		const parent = path.dirname(destPath);

		if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) {
			const embed = new EmbedBuilder()
				.setColor(0xED4245)
				.setTitle("Directory Not Found")
				.setDescription(`The destination directory \`${parent}\` does not exist.`)
				.setFooter({
					text: "discord-ssh",
					iconURL: interaction.client.user.displayAvatarURL()
				})
				.setTimestamp();

			return await interaction.editReply({
				embeds: [embed]
			});
		}

		const overwritten = fs.existsSync(destPath);

		Logger("event", `Uploading file: ${attachment.name} -> ${destPath} (${attachment.size} bytes)`);

		try {
			const response = await fetch(attachment.url);

			if (!response.ok) {
				throw new Error(`Failed to fetch attachment from Discord (HTTP ${response.status})`);
			}

			const buffer = Buffer.from(await response.arrayBuffer());
			fs.writeFileSync(destPath, buffer);

			const embed = new EmbedBuilder()
				.setColor(config.color)
				.setTitle("File Uploaded")
				.setDescription(
					`**File:** \`${attachment.name}\`\n` +
					`**Saved to:** \`${destPath}\`\n` +
					`**Size:** \`${formatSize(buffer.length)}\`` +
					(overwritten ? `\n\n**Note:** Overwrote an existing file.` : "")
				)
				.setFooter({
					text: "discord-ssh",
					iconURL: interaction.client.user.displayAvatarURL()
				})
				.setTimestamp();

			await interaction.editReply({
				embeds: [embed]
			});

			Logger("event", `Uploaded file: ${destPath}`);
		} catch (error) {
			Logger("error", `Failed to upload file ${attachment.name}: ${error}`);

			const errorEmbed = new EmbedBuilder()
				.setColor(0xED4245)
				.setTitle("Upload Failed")
				.setDescription(`Failed to save \`${attachment.name}\`\n\n**Error:**\n\`\`\`${error.message}\`\`\``)
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
		Logger("error", `Error in upload command: ${error}`);
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
