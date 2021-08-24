import { ApplicationCommandData, Client, Guild, Intents, MessageEmbed } from "discord.js";
import { readFileSync } from "fs";
import { get } from "https";

interface IData {
	token: string;
	source: string;
	source2: string;
	apiPrefix: string;
	apiSuffix: string;
}

interface IRange {
	min: number;
	max: number;
}

interface RobloxResult {
	category: string;
	title: string;
	url: string;
	weight: number;
}

interface RobloxMasterResult {
	record_count: number;
	records: {
		page: RobloxMasterResultRecord[];
	};
}

interface RobloxMasterResultRecord {
	url: string;
	title: string;
	summary: string;
	segment: string;
	body: string;
	_score: number;
	highlight: {
		body: string;
	};
}

interface RSAResult {
	url: string;
	title: string;
	excerpt: string;
	content: string;
	author: string;
}

type RobloxCategory = { [index: string]: RobloxResult };
type RSACategory = [RSAResult];

interface DataMapping {
	articles: RobloxCategory;
	videos: RobloxCategory;
	code_samples: RobloxCategory;
	datatype: RobloxCategory;
	recipes: RobloxCategory;
	enum: RobloxCategory;
	resources: RobloxCategory;
	other: RobloxCategory;
}

const weights = {
	articles: 2,
	videos: 1,
	code_samples: 1,
	datatype: 3,
	recipes: 1,
	enum: 4,
	resources: 1,
	property: 6,
	class: 7,
	event: 5,
} as { [index: string]: number };

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

const slash_command_rsa: ApplicationCommandData = {
	name: "rsa_article",
	description: "Retrieve an article from the RSA site.",
	options: [
		{
			type: "SUB_COMMAND",
			name: "author",
			description: "Retrieve articles by author.",
			options: [
				{
					type: "STRING",
					name: "authorquery",
					description: "The author name.",
					required: true,
				},
				{
					type: "INTEGER",
					name: "page",
					description: "The specified results page, if applicable.",
				},
			],
		},
		{
			type: "SUB_COMMAND",
			name: "title",
			description: "Retrieve articles by title.",
			options: [
				{
					type: "STRING",
					name: "titlequery",
					description: "The title.",
					required: true,
				},
				{
					type: "INTEGER",
					name: "page",
					description: "The specified results page, if applicable.",
				},
			],
		},
	],
};

function setupGuild(guild: Guild): void {
	const commands = guild.commands;

	commands.set([slash_command_wiki, slash_command_rsa]).catch(console.error.bind(console));
}

try {
	const data = JSON.parse(readFileSync("data2.json", "utf-8")) as IData;

	if (data.token.length === 0) {
		throw new Error("Invalid token provided. Please be sure that `token.json` contains your bot token.");
	}

	let jsonData = "";
	let rsaData = "";

	let sourceRSA: RSACategory;

	console.log("Building rsaData started.");
	get(data.source2, res => {
		res.on("data", d => {
			rsaData += d;
		});

		res.on("end", () => {
			console.log("Building rsaData completed.");
			sourceRSA = JSON.parse(rsaData) as RSACategory;
		});
	}).on("error", console.error.bind(console));

	console.log("Building sourceData started.");

	get(data.source, res => {
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
				if (interaction.isCommand()) {
					if (interaction.commandName === "wiki") {
						await interaction.deferReply();

						const query = interaction.options["_hoistedOptions"][0].value as string;

						if (!query) await interaction.editReply("Invalid query received.");

						let results: RobloxResult[] = [];
						const resultEmbed: MessageEmbed = new MessageEmbed();
						resultEmbed.setDescription(interaction.user.tag);

						Object.entries(sourceData).forEach(([index, category]: [string, RobloxCategory]) =>
							Object.values(category).find(result => {
								if (result.title.toLowerCase() === query.toLowerCase()) {
									results.push({
										category: index,
										title: result.title,
										url: result.url,
										weight: weights[index],
									});
								}
							})
						);

						if (results.length === 0) {
							Object.entries(sourceData).forEach(([index, category]: [string, RobloxCategory]) =>
								Object.values(category).find(result => {
									if (result.title.toLowerCase().includes(query.toLowerCase())) {
										results.push({
											category: index,
											title: result.title,
											url: result.url,
											weight: weights[index],
										});
									}
								})
							);
						}

						results = results.sort((a, b) => (a.weight > b.weight ? 1 : -1));

						if (results.length === 1) {
							const robloxResult = `${data.apiPrefix}${results[0].title}${data.apiSuffix}`;
							let fetchedData = "";
							let masterResult: RobloxMasterResult;

							get(robloxResult, res => {
								res.on("data", d => {
									fetchedData += d;
								});

								res.on("end", () => {
									fetchedData = fetchedData.slice(45, fetchedData.length - 1);
									masterResult = JSON.parse(fetchedData) as RobloxMasterResult;

									const matchingRecord = Object.values(masterResult.records.page).find(result => {
										if (result.url === `https://developer.roblox.com/en-us${results[0].url}`) {
											return result;
										}
									});

									if (matchingRecord) {
										let display = matchingRecord.summary;
										if (!display || display.length === 0) {
											display = matchingRecord.body.slice(0, 100);

											if (matchingRecord.highlight) {
												if (matchingRecord.highlight.body) {
													display = matchingRecord.highlight.body.slice(0, 100);
												}
											}
										}

										resultEmbed.setTitle(results[0].title);
										resultEmbed.setURL(`https://developer.roblox.com/en-us${results[0].url}`);
										resultEmbed.addField("\u200b", display, false);
									} else {
										resultEmbed.setTitle(results[0].title);
										resultEmbed.setURL(`https://developer.roblox.com/en-us${results[0].url}`);
										resultEmbed.addField("\u200b", "No description found.", false);
									}

									interaction
										.editReply({
											embeds: [resultEmbed],
										})
										.catch(console.error.bind(console));
								});
							});
						} else if (results.length > 1) {
							resultEmbed.setTitle(`Results for ${query}`);
							resultEmbed.addField(
								"\u200b",
								results
									.slice(0, Math.min(results.length, 5))
									.map(result => {
										let display = result.category;
										if (display === "other") display = result.url;

										if (display.includes("/api-reference/")) {
											display = display.slice(15).slice(0, display.slice(15).indexOf("/"));
										}

										if (display.includes("onboarding")) {
											display = "Onboarding";
											let adjustedTitle = result.title
												.slice(12)
												.slice(0, result.title.slice(12).indexOf("/"));

											adjustedTitle =
												adjustedTitle.slice(0, 1).toUpperCase() + adjustedTitle.slice(1);

											result.title = adjustedTitle;
										}

										display = display.slice(0, 1).toUpperCase() + display.slice(1);

										return `[${display}] [${result.title}](https://developer.roblox.com/en-us${result.url})`;
									})
									.join("\n"),
								true
							);

							await interaction.editReply({
								embeds: [resultEmbed],
							});
						} else {
							await interaction.editReply("Zero results found.");
						}
					} else if (interaction.commandName === "rsa_article") {
						const subCommand = interaction.options["_subcommand"];
						const query = String(interaction.options["_hoistedOptions"][0].value);
						let page = 1;

						if (interaction.options["_hoistedOptions"][1]) {
							page = interaction.options["_hoistedOptions"][1].value as number;
						}

						if (!query)
							return interaction.reply({
								ephemeral: true,
								content: "No query provided. Please try again.",
							});

						const result: RSAResult[] = [];
						const range: IRange = { min: 0, max: 5 };

						if (subCommand != "author" && subCommand != "title")
							return interaction.reply({
								ephemeral: true,
								content: "Invalid subcommand provided. Please try again.",
							});

						sourceRSA.forEach(article => {
							const field = subCommand === "author" ? article.author : article.title;

							if (
								field.toLowerCase() === query.toLowerCase() ||
								field.toLowerCase().includes(query.toLowerCase())
							) {
								result.push(article);
							}
						});

						if (page > Math.floor(result.length / 5)) page = Math.floor(result.length / 5);

						range.min = (page - 1) * 5;
						range.max = page * 5;

						if (result.length === 0) {
							await interaction.reply({
								ephemeral: true,
								content: "0 results found.",
							});
						} else if (result.length === 1) {
							await interaction.reply({
								embeds: [
									new MessageEmbed()
										.setTitle(result[0].title)
										.setDescription(result[0].author)
										.addField("\u200b", result[0].excerpt, true)
										.setURL(`https://robloxscriptassistance.org${result[0].url}`),
								],
							});
						} else {
							await interaction.reply({
								embeds: [
									new MessageEmbed()
										.setTitle(
											`${subCommand === "author" ? "Author" : "Title"} Results for: ${query}`
										)
										.setDescription(`Page: ${page}`)
										.addField(
											"\u200b",
											result
												.slice(range.min, range.max)
												.map(res => {
													return `[${res.title}](https://robloxscriptassistance.org${res.url}) - ${res.author}`;
												})
												.join("\n"),
											true
										)
										.setFooter(
											`Total Results: ${result.length} | Showing Results: ${
												range.min === 0 ? 1 : range.min
											} - ${range.max}`
										),
								],
							});
						}
					} else {
						await interaction.reply({
							ephemeral: true,
							content: "Invalid interactionData received.",
						});
					}
				}
			});

			console.log("Logging in.");

			client.login(data.token).catch(console.error.bind(console));
		});
	}).on("error", console.error.bind(console));
} catch (e) {
	console.error(e);
}
