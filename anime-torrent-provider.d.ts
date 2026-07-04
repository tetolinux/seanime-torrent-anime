/// <reference path="./anime-torrent-provider.d.ts" />

class Provider {
    // We target Nyaa's RSS page layout
    private api = "https://nyaa.si/?page=rss"

    getSettings(): AnimeProviderSettings {
        return {
            canSmartSearch: true,
            // Nyaa allows filtering via the query parameter using text terms
            smartSearchFilters: ["batch", "episodeNumber", "resolution", "query"],
            supportsAdult: false, // Set to true if you want to route into nyaa.si/?page=rss&c=1_4 (NSFW)
            type: "main"
        }
    }

    // Manual search query
    async search(opts: AnimeSearchOptions): Promise<AnimeTorrent[]> {
        // Category 1_2 filters specifically for "Anime - English-translated"
        const targetUrl = `${this.api}&c=1_2&q=${encodeURIComponent(opts.query)}`
        return await this.fetchAndParseRss(targetUrl)
    }

    // Smart search handled via raw search strings
    async smartSearch(opts: AnimeSmartSearchOptions): Promise<AnimeTorrent[]> {
        let searchQuery = opts.query || opts.media.romajiTitle || opts.media.englishTitle || ""
        
        if (opts.resolution) {
            searchQuery += ` ${opts.resolution}`
        }
        if (opts.batch) {
            searchQuery += " Batch"
        } else if (opts.episodeNumber > 0) {
            const epString = opts.episodeNumber < 10 ? `0${opts.episodeNumber}` : `${opts.episodeNumber}`
            searchQuery += ` ${epString}`
        }

        const targetUrl = `${this.api}&c=1_2&q=${encodeURIComponent(searchQuery)}`
        return await this.fetchAndParseRss(targetUrl)
    }

    // Fetches Nyaa's XML RSS stream and parses out metadata tags
    private async fetchAndParseRss(url: string): Promise<AnimeTorrent[]> {
        try {
            const response = await fetch(url)
            if (!response.ok) throw new Error(`Nyaa response failed: ${response.statusText}`)
            
            const xmlText = await response.text()
            return this.parseNyaaXml(xmlText)
        } catch (error) {
            console.error("Error retrieving Nyaa RSS data:", error)
            return []
        }
    }

    // Lightweight XML Parser built for standard RSS formats inside Seanime extension bounds
    private parseNyaaXml(xmlText: string): AnimeTorrent[] {
        const torrents: AnimeTorrent[] = []
        // Split up XML by each unique item listing block
        const items = xmlText.split("<item>")
        
        // Skip index 0 because it contains global channel metadata before the first item block
        for (let i = 1; i < items.length; i++) {
            const item = items[i]
            
            const extractTag = (tagName: string): string => {
                const match = item.match(new RegExp(`<${tagName}>?([^<>]+)</${tagName}>`))
                return match ? match[1].trim() : ""
            }

            // Nyaa passes its specific torrent layout extensions inside special tags
            const title = extractTag("title")
            const guid = extractTag("guid") // Dedicated layout webpage url
            const pubDate = extractTag("pubDate")
            
            // Custom Nyaa metadata parameters passed inside the XML scheme
            const seeders = parseInt(extractTag("nyaa:seeders")) || 0
            const leechers = parseInt(extractTag("nyaa:leechers")) || 0
            const downloads = parseInt(extractTag("nyaa:downloads")) || 0
            const infoHash = extractTag("nyaa:infoHash")
            const size = parseInt(extractTag("nyaa:size")) || 0

            // The direct downloadUrl link can be extracted from standard link fields
            const downloadUrl = extractTag("link") 

            if (title) {
                torrents.push({
                    name: title,
                    date: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
                    size: size,
                    formattedSize: "", // Handled automatically by Seanime
                    seeders: seeders,
                    leechers: leechers,
                    downloadCount: downloads,
                    link: guid,
                    downloadUrl: downloadUrl,
                    magnetLink: `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(title)}`,
                    infoHash: infoHash,
                    episodeNumber: -1, // Tells Seanime to parse out episode figures from title
                    isBestRelease: false,
                    confirmed: true
                })
            }
        }
        return torrents
    }

    async getTorrentInfoHash(torrent: AnimeTorrent): Promise<string> { return torrent.infoHash || "" }
    async getTorrentMagnetLink(torrent: AnimeTorrent): Promise<string> { return torrent.magnetLink || "" }
    
    // Automatically called by the auto downloader to pick up active listings
    async getLatest(): Promise<AnimeTorrent[]> {
        const targetUrl = `${this.api}&c=1_2`
        return await this.fetchAndParseRss(targetUrl)
    }
}
