const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

const API_BASE = "https://api.reidoscanais.st";

const builder = new addonBuilder({
    id: "org.reidoscanais.v3.stremio",
    version: "3.1.0",
    name: "Rei dos Canais - Catálogos",
    description: "Canais de TV agrupados por categorias e agenda esportiva ao vivo.",
    resources: ["catalog", "meta", "stream"],
    types: ["tv"],
    idPrefixes: ["rdc_channel:", "rdc_sport:", "rdc:"],
    catalogs: [
        { type: "tv", id: "rdc_todos", name: "RDC - Todos os Canais" },
        { type: "tv", id: "rdc_agenda", name: "RDC - Agenda Esportiva" },
        { type: "tv", id: "rdc_abertos", name: "RDC - Canais Abertos" },
        { type: "tv", id: "rdc_esportes", name: "RDC - Esportes" },
        { type: "tv", id: "rdc_filmes", name: "RDC - Filmes e Séries" },
        { type: "tv", id: "rdc_docs", name: "RDC - Documentários" },
        { type: "tv", id: "rdc_infantil", name: "RDC - Infantil" },
        { type: "tv", id: "rdc_noticias", name: "RDC - Notícias" }
    ]
});

const defaultHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Referer": "https://reidoscanais.st/"
};

// Palavras-chave amplas para capturar canais por Nome ou Categoria da API
const categoryKeywords = {
    "rdc_abertos": ["aberto", "abertos", "variedades", "globo", "sbt", "band", "record", "redetv", "tv cultura"],
    "rdc_esportes": ["esporte", "esportes", "sport", "sports", "premiere", "espn", "combate", "sportv", "caze", "band sports"],
    "rdc_filmes": ["filme", "filmes", "serie", "series", "série", "séries", "cinema", "hbo", "telecine", "paramount", "warner", "axn", "amc", "universal", "space", "tnt", "megapix"],
    "rdc_docs": ["doc", "docs", "documentario", "documentarios", "documentário", "documentários", "discovery", "history", "nat geo", "national", "animal", "investigacao"],
    "rdc_infantil": ["infantil", "kids", "desenho", "desenhos", "cartoon", "gloob", "disney", "nick", "toon", "bitita"],
    "rdc_noticias": ["noticia", "noticias", "notícia", "notícias", "jornal", "news", "cnn", "bandnews", "record news", "jovem pan"]
};

// Normalizador para ignorar acentos e maiúsculas/minúsculas
function normalizeText(text) {
    if (!text) return "";
    return text.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// 1. CARREGAMENTO DOS CATÁLOGOS
builder.defineCatalogHandler(async (args) => {
    try {
        // AGENDA ESPORTIVA
        if (args.id === "rdc_agenda") {
            const res = await axios.get(`${API_BASE}/sports?status=live`, { headers: defaultHeaders }).catch(() => null);
            const rawSports = res?.data?.data || res?.data || [];

            const metas = rawSports.map((item) => {
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

        // DEMAIS CATÁLOGOS DE CANAIS DE TV
        const res = await axios.get(`${API_BASE}/channels`, { headers: defaultHeaders }).catch(() => null);
        const channels = res?.data?.data || res?.data || [];
        const keywords = categoryKeywords[args.id] || [];

        const filteredChannels = channels.filter((channel) => {
            if (args.id === "rdc_todos") return true;

            const name = normalizeText(channel.name || channel.title);
            const category = normalizeText(channel.category || channel.genre);

            return keywords.some(key => name.includes(key) || category.includes(key));
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
    const rawId = args.id.replace("rdc_sport:", "").replace("rdc_channel:", "").replace("rdc:", "");
    const isSport = args.id.includes("rdc_sport:");
    const endpoint = isSport ? `${API_BASE}/sports/${rawId}` : `${API_BASE}/channels/${rawId}`;

    try {
        let response = await axios.get(endpoint, { headers: defaultHeaders }).catch(() => null);
        if (!response || !response.data) {
            response = await axios.get(`${API_BASE}/channels/${rawId}`, { headers: defaultHeaders }).catch(() => null);
        }

        const item = response?.data?.data || response?.data;

        if (!item) {
            return {
                meta: {
                    id: args.id,
                    type: "tv",
                    name: rawId.toUpperCase().replace(/-/g, " "),
                    description: "Informações indisponíveis no momento."
                }
            };
        }

        let epgDescription = "";

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

// 3. RETORNO DOS SERVIDORES
builder.defineStreamHandler(async (args) => {
    const rawId = args.id.replace("rdc_sport:", "").replace("rdc_channel:", "").replace("rdc:", "");
    
    try {
        let response = await axios.get(`${API_BASE}/channels/${rawId}`, { headers: defaultHeaders }).catch(() => null);
        if (!response || !response.data) {
            response = await axios.get(`${API_BASE}/sports/${rawId}`, { headers: defaultHeaders }).catch(() => null);
        }

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
