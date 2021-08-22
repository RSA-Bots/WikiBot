import { ApplicationCommandData, Client, CommandInteraction, Guild, Intents, MessageEmbed } from "discord.js";
import { readFileSync } from "fs";
import { get } from "https";

interface IData {
	token: string;
	source: string;
}

interface IResult {
	category: string;
	title: string;
	url: string;
}
interface Result {
	title: string;
	url: string;
}
type F = { [index: string]: Result };

interface DataMapping {
	articles: F;
	videos: F;
	code_samples: F;
	datatype: F;
	recipes: F;
	enum: F;
	resources: F;
	other: F;
}

const slash_command_wiki: ApplicationCommandData = {
	name: "wiki",
	description: "Search Roblox's Developer Hub.",
	options: [
		{
			type: "STRING",
			name: "query",
			description: "The query to search for.",
			required: true,
		},
	],
};

function setupGuild(guild: Guild): void {
	const commands = guild.commands;

	commands.set([slash_command_wiki]).catch(console.error.bind(console));
}

try {
	const { token, source } = JSON.parse(readFileSync("data2.json", "utf-8")) as IData;

	if (token.length === 0) {
		throw new Error("Invalid token provided. Please be sure that `token.json` contains your bot token.");
	}

	let jsonData = "";

	console.log("Building sourceData started.");

	get(source, res => {
		res.on("data", d => {
			jsonData += d;
		});

		res.on("end", () => {
			console.log("Building sourceData completed.");
			const sourceData = JSON.parse(jsonData) as DataMapping;

			const client = new Client({
				intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MEMBERS],
			});

			client.once("ready", () => {
				console.log("Client logged in.");

				client.guilds
					.fetch()
					.then(oauthGuilds => {
						oauthGuilds.forEach(guildPreview => {
							guildPreview.fetch().then(setupGuild).catch(console.error.bind(console));
						});
					})
					.catch(console.error.bind(console));
			});

			client.on("guildCreate", setupGuild);

			client.on("interactionCreate", async interaction => {
				if (interaction.isCommand() && interaction.commandName === "wiki") {
					await interaction.deferReply();

					const query = interaction.options["_hoistedOptions"][0].value as string;

					if (!query) await interaction.editReply("Invalid query received.");

					const results: IResult[] = [];

					Object.entries(sourceData).forEach(([index, category]: [string, F]) =>
						Object.values(category).find(result => {
							if (result.title.toLowerCase() === query.toLowerCase()) {
								results.push({ category: index, title: result.title, url: result.url });
							}
						})
					);

					if (results.length === 0) {
						Object.entries(sourceData).forEach(([index, category]: [string, F]) =>
							Object.values(category).find(result => {
								if (result.title.toLowerCase().includes(query.toLowerCase())) {
									results.push({ category: index, title: result.title, url: result.url });
								}
							})
						);
					}

					if (results.length === 1) {
						await interaction.editReply({
							embeds: [
								new MessageEmbed()
									.setTitle(results[0].title)
									.setURL(`https://developer.roblox.com/en-us${results[0].url}`)
									.addField("\u200b", "Current placeholder.", false),
							],
						});
					} else if (results.length > 1) {
						await interaction.editReply({
							embeds: [
								new MessageEmbed()
									.setTitle(`Results for ${query}`)
									.setAuthor(interaction.user.tag)
									.addField(
										"\u200b",
										results
											.slice(0, Math.min(results.length, 5))
											.map(result => {
												let display = result.category;
												if (display === "other") display = result.url;

												if (display.includes("/api-reference/")) {
													display = display
														.slice(15)
														.slice(0, display.slice(15).indexOf("/"));
												}

												if (display.includes("onboarding")) {
													display = "Onboarding";
													let adjustedTitle = result.title
														.slice(12)
														.slice(0, result.title.slice(12).indexOf("/"));

													adjustedTitle =
														adjustedTitle.slice(0, 1).toUpperCase() +
														adjustedTitle.slice(1);

													result.title = adjustedTitle;
												}

												display = display.slice(0, 1).toUpperCase() + display.slice(1);

												return `[${display}] [${result.title}](https://developer.roblox.com/en-us${result.url})`;
											})
											.join("\n"),
										true
									),
							],
						});
					} else {
						await interaction.editReply({ content: "0 Results Found." });
					}
				} else {
					await (interaction as CommandInteraction).reply({
						ephemeral: true,
						content: "Invalid interactionData received.",
					});
				}
			});

			console.log("Logging in.");

			client.login(token).catch(console.error.bind(console));
		});
	}).on("error", console.error.bind(console));
} catch (e) {
	console.error(e);
}
