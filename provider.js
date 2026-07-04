class Provider {
    api = "https://nyaa.si/?page=rss"

    getSettings() {
        return {
            canSmartSearch: true,
            smartSearchFilters: ["batch", "episodeNumber", "resolution", "query"],
            supportsAdult: false,
            type: "main"
        }
    }

    async search(opts) {
        const cleanedQuery = this.cleanSearchTerm(opts.query);
        const url = `${this.api}&c=1_2&q=${encodeURIComponent(cleanedQuery)}`
        return await this.fetchAndParseRss(url)
    }

    async smartSearch(opts) {
        // Try Romaji first, then English title if Romaji is missing
        let baseTitle = opts.media.romajiTitle || opts.media.englishTitle || opts.query || "";
        
        // Clean up strict punctuation characters that break Nyaa's engine
        baseTitle = this.cleanSearchTerm(baseTitle);

        let q = baseTitle;

        // Add resolution if specified
        if (opts.resolution) {
            q += ` ${opts.resolution}`;
        }

        // Add batch modifier or pad episode numbers perfectly (e.g., "01" instead of "1")
        if (opts.batch) {
            q += ' Batch';
        } else if (opts.episodeNumber > 0) {
            const ep = opts.episodeNumber < 10 ? `0${opts.episodeNumber}` : `${opts.episodeNumber}`;
            q += ` ${ep}`;
        }

        let url = `${this.api}&c=1_2&q=${encodeURIComponent(q)}`;
        let results = await this.fetchAndParseRss(url);

        // FALLBACK: If Romaji returned 0 results, try again immediately using the English title
        if (results.length === 0 && opts.media.englishTitle && opts.media.englishTitle !== opts.media.romajiTitle) {
            let engTitle = this.cleanSearchTerm(opts.media.englishTitle);
            let fallbackQ = engTitle;
            if (opts.resolution) fallbackQ += ` ${opts.resolution}`;
            if (opts.batch) fallbackQ += ' Batch';
            else if (opts.episodeNumber > 0) {
                const ep = opts.episodeNumber < 10 ? `0${opts.episodeNumber}` : `${opts.episodeNumber}`;
                fallbackQ += ` ${ep}`;
            }
            url = `${this.api}&c=1_2&q=${encodeURIComponent(fallbackQ)}`;
            results = await this.fetchAndParseRss(url);
        }

        return results;
    }

    // Helper utility to remove nasty characters that ruin Nyaa text lookups
    cleanSearchTerm(text) {
        if (!text) return "";
        return text
            .replace(/[:,\-–\!]/g, ' ') // Replace colons, commas, hyphens, exclamations with spaces
            .replace(/\s+/g, ' ')       // Condense multiple spaces down to a single space
            .trim();
    }

    async fetchAndParseRss(url) {
        try {
            const res = await fetch(url)
            if (!res.ok) throw new Error(res.statusText)
            const txt = await res.text()
            return this.parseNyaaXml(txt)
        } catch (e) {
            console.error(e)
            return []
        }
    }

    parseNyaaXml(txt) {
        const torrents = []
        const items = txt.split('<item>')
        for (let i = 1; i < items.length; i++) {
            const item = items[i]
            const tag = (t) => {
                const m = item.match(new RegExp(`<${t}>?([^<>]+)</${t}>`))
                return m ? m[1].trim() : ''
            }
            const title = tag('title')
            const guid = tag('guid')
            const pubDate = tag('pubDate')
            const seeders = parseInt(tag('nyaa:seeders')) || 0
            const leechers = parseInt(tag('nyaa:leechers')) || 0
            const downloads = parseInt(tag('nyaa:downloads')) || 0
            const infoHash = tag('nyaa:infoHash')
            const size = parseInt(tag('nyaa:size')) || 0
            const downloadUrl = tag('link')

            if (title) {
                torrents.push({
                    name: title,
                    date: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
                    size: size,
                    formattedSize: '',
                    seeders: seeders,
                    leechers: leechers,
                    downloadCount: downloads,
                    link: guid,
                    downloadUrl: downloadUrl,
                    magnetLink: `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(title)}`,
                    infoHash: infoHash,
                    episodeNumber: -1,
                    isBestRelease: false,
                    confirmed: true
                })
            }
        }
        return torrents
    }

    async getTorrentInfoHash(t) { return t.infoHash || '' }
    async getTorrentMagnetLink(t) { return t.magnetLink || '' }
    async getLatest() { return await this.fetchAndParseRss(`${this.api}&c=1_2`) }
}
