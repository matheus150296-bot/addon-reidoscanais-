const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

const API_BASE = "https://api.reidoscanais.st";

const builder = new addonBuilder({
    id: "org.reidoscanais.proxy.stremio",
    version: "1.6.0",
    name: "Rei dos Canais - Player Direto",
    description: "Assista aos canais no player do Stremio via Proxy.",
    resources: ["catalog", "meta", "stream"],
    types: ["tv"],
    catalogs: [
        { type: "tv", id: "rdc_channels", name: "Rei dos Canais - TV ao Vivo" },
        { type: "tv", id: "rdc_sports", name: "Rei dos Canais - Esportes ao Vivo" }
    ]
});

const defaultHeaders = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Referer": "https://reidoscanais.st/"
};

// 1. CATÁLOGOS
builder.defineCatalogHandler(async (args) => {
    try {
        const endpoint = args.id === "rdc_sports" ? `${API_BASE}/sports?status=live` : `${API_BASE}/channels`;
        const response = await axios.get(endpoint, { headers: defaultHeaders });
        const items = response.data.data || response.data || [];

        const metas = items.map((item) => {
            const id = item.id || item.slug || String(item.name).toLowerCase().replace(/\s+/g, "-");
            return {
                id: `rdc:${id}`,
                type: "tv",
                name: item.name || item.title || "Canal Sem Nome",
                poster: item.logo_url || item.logo || item.poster || item.image || undefined,
                description: item.epg?.current?.title ? `NO AR: ${item.epg.current.title}` : (item.category || "Ao Vivo")
            };
        });

        return { metas };
    } catch {
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
            description: "Ao vivo via Rei dos Canais"
        }
    };
});

// 3. EXTRAÇÃO DE SERVIDORES
builder.defineStreamHandler(async (args) => {
    const channelId = args.id.replace("rdc:", "");
    try {
        let response = await axios.get(`${API_BASE}/channels/${channelId}`, { headers: defaultHeaders }).catch(() => null);
        if (!response || !response.data) {
            response = await axios.get(`${API_BASE}/sports/${channelId}`, { headers: defaultHeaders }).catch(() => null);
        }

        const item = response?.data?.data || response?.data;
        const streams = [];

        if (item) {
            const embeds = item.embeds || (item.embed_url ? [{ embed_url: item.embed_url }] : []);

            for (let i = 0; i < embeds.length; i++) {
                const embed = embeds[i];
                const provider = embed.provider || `Servidor ${i + 1}`;
                const quality = embed.quality ? `[${embed.quality.toUpperCase()}]` : "";
                const embedUrl = embed.embed_url || embed.url;

                if (embedUrl) {
                    try {
                        const embedRes = await axios.get(embedUrl, { 
                            headers: { ...defaultHeaders, "Referer": "https://reidoscanais.st/" },
                            timeout: 4000 
                        });

                        const match = embedRes.data.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);

                        if (match && match[1]) {
                            streams.push({
                                title: `▶ Stremio Direct - ${provider} ${quality}`,
                                url: match[1],
                                behaviorHints: {
                                    notSupported: false,
                                    requestHeaders: {
                                        "User-Agent": defaultHeaders["User-Agent"],
                                        "Referer": embedUrl
                                    }
                                }
                            });
                        }
                    } catch (e) {
                        // Caso a extração falhe
                    }

                    // Opção para abrir o Player Web do site
                    streams.push({
                        title: `🌐 Player Web - ${provider} ${quality}`,
                        externalUrl: embedUrl
                    });
                }
            }
        }

        return { streams };
    } catch {
        return { streams: [] };
    }
});

const PORT = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: PORT });
