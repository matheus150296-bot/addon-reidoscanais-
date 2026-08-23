const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");

const API_BASE = "https://api.reidoscanais.st";

const builder = new addonBuilder({
    id: "org.reidoscanais.official.stremio",
    version: "1.2.0",
    name: "Rei dos Canais API",
    description: "Canais ao vivo e eventos esportivos integrados via API oficial.",
    resources: ["catalog", "meta", "stream"],
    types: ["tv"],
    catalogs: [
        {
            type: "tv",
            id: "rdc_channels",
            name: "Rei dos Canais - TV ao Vivo"
        },
        {
            type: "tv",
            id: "rdc_sports",
            name: "Rei dos Canais - Esportes ao Vivo"
        }
    ]
});

const headers = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Referer": "https://reidoscanais.st/"
};

// 1. CATÁLOGOS
builder.defineCatalogHandler(async (args) => {
    try {
        const endpoint = args.id === "rdc_sports" ? `${API_BASE}/sports?status=live` : `${API_BASE}/channels`;
        const response = await axios.get(endpoint, { headers });
        const items = response.data.data || response.data || [];

        const metas = items.map((item) => {
            const id = item.id || item.slug || String(item.name).toLowerCase().replace(/\s+/g, "-");
            return {
                id: `rdc:${id}`,
                type: "tv",
                name: item.name || item.title || "Canal Sem Nome",
                poster: item.logo || item.poster || item.image || undefined,
                description: item.epg?.current?.title 
                    ? `NO AR: ${item.epg.current.title}` 
                    : (item.category || "Transmissão ao Vivo")
            };
        });

        return { metas };
    } catch (error) {
        return { metas: [] };
    }
});

// 2. METADADOS
builder.defineMetaHandler(async (args) => {
    const channelId = args.id.replace("rdc:", "");
    return {
        meta: {
            id: args.id,
            type: "tv",
            name: channelId.toUpperCase().replace(/-/g, " "),
            description: "Transmissão ao vivo via Rei dos Canais"
        }
    };
});

// 3. EXTRAÇÃO DO STREAM (.m3u8) DENTRO DO EMBED
builder.defineStreamHandler(async (args) => {
    const channelId = args.id.replace("rdc:", "");
    try {
        // Busca detalhes na API
        const response = await axios.get(`${API_BASE}/channels/${channelId}`, { headers }).catch(() => null);
        const item = response?.data?.data || response?.data;

        // Pega o embed_url da resposta da API
        let embedUrl = null;
        if (item?.embeds && item.embeds.length > 0) {
            embedUrl = item.embeds[0].embed_url;
        } else if (item?.embed_url) {
            embedUrl = item.embed_url;
        }

        const streams = [];

        if (embedUrl) {
            try {
                // Acessa o HTML do embed_url para localizar o arquivo .m3u8 real
                const embedPage = await axios.get(embedUrl, { 
                    headers: { ...headers, "Referer": "https://reidoscanais.st/" },
                    timeout: 5000 
                });

                // Procura a URL do .m3u8 via Expressão Regular dentro do HTML/JS
                const m3u8Match = embedPage.data.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);

                if (m3u8Match && m3u8Match[1]) {
                    streams.push({
                        title: "Transmissão Direta (HLS)",
                        url: m3u8Match[1],
                        behaviorHints: {
                            notSupported: false,
                            requestHeaders: {
                                "User-Agent": headers["User-Agent"],
                                "Referer": embedUrl
                            }
                        }
                    });
                }
            } catch (e) {
                console.error("Falha ao raspar embed:", e.message);
            }

            // Opção alternativa: abrir o embed diretamente via web/player externo
            streams.push({
                title: "Abrir Player Web (Embed)",
                externalUrl: embedUrl
            });
        }

        return { streams };
    } catch (error) {
        return { streams: [] };
    }
});

const PORT = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: PORT });
