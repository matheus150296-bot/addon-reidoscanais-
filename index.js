const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

const API_BASE = "https://api.reidoscanais.st";

const builder = new addonBuilder({
    id: "org.reidoscanais.official.stremio",
    version: "1.1.0",
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

builder.defineCatalogHandler(async (args) => {
    try {
        let endpoint = `${API_BASE}/channels`;
        if (args.id === "rdc_sports") {
            endpoint = `${API_BASE}/sports?status=live`;
        }

        const response = await axios.get(endpoint);
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
        console.error("Erro ao carregar catálogo:", error.message);
        return { metas: [] };
    }
});

builder.defineMetaHandler(async (args) => {
    const channelId = args.id.replace("rdc:", "");
    try {
        const response = await axios.get(`${API_BASE}/channels/${channelId}`).catch(() => null);
        const item = response?.data?.data || response?.data;

        return {
            meta: {
                id: args.id,
                type: "tv",
                name: item?.name || channelId.toUpperCase(),
                poster: item?.logo || undefined,
                description: item?.epg?.current?.title 
                    ? `Programa atual: ${item.epg.current.title}` 
                    : "Canal ao vivo via Rei dos Canais"
            }
        };
    } catch {
        return {
            meta: {
                id: args.id,
                type: "tv",
                name: channelId.toUpperCase(),
                description: "Canal ao vivo"
            }
        };
    }
});

builder.defineStreamHandler(async (args) => {
    const channelId = args.id.replace("rdc:", "");
    try {
        const response = await axios.get(`${API_BASE}/channels/${channelId}`);
        const channelData = response.data.data || response.data;

        const streams = [];

        if (channelData.stream_url || channelData.m3u8) {
            streams.push({
                title: "Transmissão Direta (HLS)",
                url: channelData.stream_url || channelData.m3u8
            });
        }

        if (channelData.embed_url || channelData.player) {
            streams.push({
                title: "Player Embed Web",
                externalUrl: channelData.embed_url || channelData.player
            });
        }

        return { streams };
    } catch (error) {
        console.error("Erro ao obter stream:", error.message);
        return { streams: [] };
    }
});

const PORT = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: PORT });
