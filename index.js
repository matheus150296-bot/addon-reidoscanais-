const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

const API_BASE = "https://api.reidoscanais.st";

const builder = new addonBuilder({
    id: "org.reidoscanais.official.stremio",
    version: "1.3.0",
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

// 1. CATÁLOGOS
builder.defineCatalogHandler(async (args) => {
    try {
        const endpoint = args.id === "rdc_sports" ? `${API_BASE}/sports?status=live` : `${API_BASE}/channels`;
        const response = await axios.get(endpoint);
        const items = response.data.data || response.data || [];

        const metas = items.map((item) => {
            const id = item.id || item.slug || String(item.name).toLowerCase().replace(/\s+/g, "-");
            return {
                id: `rdc:${id}`,
                type: "tv",
                name: item.name || item.title || "Canal Sem Nome",
                poster: item.logo_url || item.logo || item.poster || item.image || undefined,
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

// 3. RETORNO DO STREAM (PLAYER EMBED DA API)
builder.defineStreamHandler(async (args) => {
    const channelId = args.id.replace("rdc:", "");
    try {
        // Consulta o endpoint /channels/{id} ou /sports/{id} na API
        let response = await axios.get(`${API_BASE}/channels/${channelId}`).catch(() => null);
        if (!response || !response.data) {
            response = await axios.get(`${API_BASE}/sports/${channelId}`).catch(() => null);
        }

        const item = response?.data?.data || response?.data;
        const streams = [];

        if (item) {
            // Extrai o embed_url do array embeds[0] exibido na documentação
            let embedUrl = null;
            if (item.embeds && Array.isArray(item.embeds) && item.embeds.length > 0) {
                embedUrl = item.embeds[0].embed_url;
            } else if (item.embed_url) {
                embedUrl = item.embed_url;
            }

            if (embedUrl) {
                streams.push({
                    title: "Assistir no Player Web (Embed)",
                    externalUrl: embedUrl
                });
            }
        }

        return { streams };
    } catch (error) {
        return { streams: [] };
    }
});

const PORT = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: PORT });

