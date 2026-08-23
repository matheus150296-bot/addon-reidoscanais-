const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

const API_BASE = "https://api.reidoscanais.st";

const builder = new addonBuilder({
    id: "org.reidoscanais.grouped.stremio",
    version: "2.0.0",
    name: "Rei dos Canais - Catálogos & EPG",
    description: "Canais agrupados por categoria e guia de programação (EPG) detalhado.",
    resources: ["catalog", "meta", "stream"],
    types: ["tv"],
    catalogs: [
        { type: "tv", id: "rdc_agenda", name: "Agenda Esportiva" },
        { type: "tv", id: "rdc_abertos", name: "Canais Abertos" },
        { type: "tv", id: "rdc_documentarios", name: "Documentários" },
        { type: "tv", id: "rdc_entretenimento", name: "Entretenimento" },
        { type: "tv", id: "rdc_esportes", name: "Esportes" },
        { type: "tv", id: "rdc_filmes_series", name: "Filmes e Séries" },
        { type: "tv", id: "rdc_infantil", name: "Infantil" },
        { type: "tv", id: "rdc_noticias", name: "Notícias" }
    ]
});

const defaultHeaders = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Referer": "https://reidoscanais.st/"
};

// Mapeamento de categorias da API do site
const categoryMap = {
    "rdc_abertos": ["Canais Abertos", "Abertos", "Variedades"],
    "rdc_documentarios": ["Documentários", "Documentarios", "Ciência"],
    "rdc_entretenimento": ["Entretenimento", "Variedades"],
    "rdc_esportes": ["Esportes", "Sports"],
    "rdc_filmes_series": ["Filmes e Séries", "Filmes", "Séries", "Cinema"],
    "rdc_infantil": ["Infantil", "Desenhos", "Kids"],
    "rdc_noticias": ["Notícias", "Noticias", "Jornalismo"]
};

// 1. CATÁLOGOS AGRUPADOS
builder.defineCatalogHandler(async (args) => {
    try {
        if (args.id === "rdc_agenda") {
            const res = await axios.get(`${API_BASE}/sports?status=live`, { headers: defaultHeaders }).catch(() => null);
            const sports = res?.data?.data || res?.data || [];

            const metas = sports.map((item) => {
                const id = item.id || item.slug || String(item.title || item.name).toLowerCase().replace(/\s+/g, "-");
                return {
                    id: `rdc_sport:${id}`,
                    type: "tv",
                    name: item.title || item.name || "Evento Esportivo",
                    poster: item.image || item.poster || item.logo || undefined,
                    description: item.competition ? `🏆 ${item.competition} | 🕒 ${item.event_time || "Ao Vivo"}` : "Evento Esportivo Ao Vivo"
                };
            });

            return { metas };
        }

        // Busca todos os canais e filtra pela categoria selecionada
        const res = await axios.get(`${API_BASE}/channels`, { headers: defaultHeaders }).catch(() => null);
        const channels = res?.data?.data || res?.data || [];
        const targetCategories = categoryMap[args.id] || [];

        const filteredChannels = channels.filter((channel) => {
            if (!targetCategories.length) return true;
            const channelCat = (channel.category || "").toLowerCase();
            return targetCategories.some((cat) => channelCat.includes(cat.toLowerCase()));
        });

        const metas = filteredChannels.map((item) => {
            const id = item.id || item.slug || String(item.name).toLowerCase().replace(/\s+/g, "-");
            const currentProg = item.epg?.current?.title ? `Agora: ${item.epg.current.title}` : (item.category || "TV ao Vivo");

            return {
                id: `rdc_channel:${id}`,
                type: "tv",
                name: item.name || item.title || "Canal",
                poster: item.logo_url || item.logo || item.poster || undefined,
                description: currentProg
            };
        });

        return { metas };
    } catch {
        return { metas: [] };
    }
});

// 2. METADADOS E EPG DETALHADO POR CANAL
builder.defineMetaHandler(async (args) => {
    const isSport = args.id.startsWith("rdc_sport:");
    const rawId = args.id.replace("rdc_sport:", "").replace("rdc_channel:", "");
    const endpoint = isSport ? `${API_BASE}/sports/${rawId}` : `${API_BASE}/channels/${rawId}`;

    try {
        const response = await axios.get(endpoint, { headers: defaultHeaders }).catch(() => null);
        const item = response?.data?.data || response?.data;

        if (!item) {
            return {
                meta: {
                    id: args.id,
                    type: "tv",
                    name: rawId.toUpperCase().replace(/-/g, " "),
                    description: "Sem informações de programação disponíveis no momento."
                }
            };
        }

        let epgDescription = "";

        // Formatação do EPG
        if (item.epg) {
            if (item.epg.current) {
                const start = item.epg.current.start_time || "";
                const end = item.epg.current.end_time || "";
                const timeStr = start && end ? ` (${start} - ${end})` : "";
                epgDescription += `📺 AGORA: ${item.epg.current.title}${timeStr}\n\n`;
            }

            if (item.epg.next && Array.isArray(item.epg.next) && item.epg.next.length > 0) {
                epgDescription += "📅 PRÓXIMOS PROGRAMAS:\n";
                item.epg.next.slice(0, 5).forEach((prog) => {
                    const pTime = prog.start_time ? `[${prog.start_time}] ` : "• ";
                    epgDescription += `${pTime}${prog.title}\n`;
                });
            }
        }

        if (!epgDescription) {
            epgDescription = item.description || item.category || "Transmissão ao Vivo via Rei dos Canais";
        }

        return {
            meta: {
                id: args.id,
                type: "tv",
                name: item.name || item.title || rawId.toUpperCase(),
                poster: item.logo_url || item.logo || item.image || undefined,
                background: item.banner || item.image || undefined,
                description: epgDescription
            }
        };
    } catch {
        return {
            meta: {
                id: args.id,
                type: "tv",
                name: rawId.toUpperCase(),
                description: "Não foi possível carregar o EPG deste canal."
            }
        };
    }
});

// 3. RETORNO DE TODOS OS SERVIDORES (STREAM)
builder.defineStreamHandler(async (args) => {
    const isSport = args.id.startsWith("rdc_sport:");
    const rawId = args.id.replace("rdc_sport:", "").replace("rdc_channel:", "");
    const endpoint = isSport ? `${API_BASE}/sports/${rawId}` : `${API_BASE}/channels/${rawId}`;

    try {
        const response = await axios.get(endpoint, { headers: defaultHeaders }).catch(() => null);
        const item = response?.data?.data || response?.data;
        const streams = [];

        if (item) {
            const embeds = item.embeds || (item.embed_url ? [{ embed_url: item.embed_url }] : []);

            embeds.forEach((embed, index) => {
                const provider = embed.provider || `Servidor ${index + 1}`;
                const quality = embed.quality ? `[${embed.quality.toUpperCase()}]` : "";
                const embedUrl = embed.embed_url || embed.url;

                if (embedUrl) {
                    streams.push({
                        title: `Player Web - ${provider} ${quality}`.trim(),
                        externalUrl: embedUrl
                    });
                }
            });
        }

        return { streams };
    } catch {
        return { streams: [] };
    }
});

const PORT = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: PORT });
