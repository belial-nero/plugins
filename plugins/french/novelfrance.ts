import { fetchText } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
/**
 * Interface pour typer les données reçues de l'API de NovelFrance
 * Cela règle l'erreur "Unexpected any"
 */
type ApiChapter = {
    id: string;
    chapterNumber: number;
    title: string;
    slug: string;
    createdAt: string;
    wordCount: number;
    viewCount: number;
    isRead: boolean;
}

class TemplatePlugin implements Plugin.PluginBase {
    id = 'novelfrance';
    name = 'Novel France';
    icon = 'fr/novelfrance/icon.png';
    site = 'https://novelfrance.fr/';
    version = '1.0.0';
    filters: Filters | undefined = undefined;
    imageRequestInit?: Plugin.ImageRequestInit | undefined = undefined;

    async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
        if (pageNo > 1) return [];
        const novels: Plugin.NovelItem[] = [];

        const body = await fetchText(`${this.site}novels`); 
        const $ = loadCheerio(body);

        $('a.group').each((i, el) => {
            const name = $(el).find('h3').text().trim();
            const cover = $(el).find('img').attr('src');
            const path = $(el).attr('href');

            if (name && path) {
                novels.push({
                    name: name,
                    cover: cover ? (cover.startsWith('http') ? cover : this.site + cover.replace(/^\//, '')) : defaultCover,
                    path: path.replace(this.site, ''), 
                });
            }
        });

        return novels;
    }

async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    // Nettoyage radical du nom du roman
    const novelName = novelPath.split('/').filter(part => part.length > 0).pop();
    const novelUrl = `${this.site}novel/${novelName}`;
    
    console.log("Nom du roman extrait :", novelName); // Vérifie ça dans la console F12

    const body = await fetchText(novelUrl);
    const $ = loadCheerio(body);

    const novel: Plugin.SourceNovel = {
        path: novelPath,
        name: $('h1').text().trim() || "Sans titre",
    };

    const chapters: Plugin.ChapterItem[] = [];
    let skip = 0;
    const take = 50;
    let hasMore = true;

    while (hasMore) {
        // On construit l'URL proprement sans doubles slashes
        const apiUrl = `https://novelfrance.fr/api/chapters/${novelName}?skip=${skip}&take=${take}&order=asc`;
        console.log("Appel API :", apiUrl);

        try {
            const apiResponse = await fetchText(apiUrl);
            
            if (!apiResponse || apiResponse.trim().length === 0) {
                hasMore = false;
                break;
            }

            const data = JSON.parse(apiResponse);

            if (Array.isArray(data) && data.length > 0) {
                data.forEach((ch: ApiChapter) => {
                    chapters.push({
                        name: `Chapitre ${ch.chapterNumber} ${ch.title}`,
                        path: `novel/${novelName}/${ch.slug}`,
                        releaseTime: new Date(ch.createdAt).toISOString(),
                        chapterNumber: ch.chapterNumber,
                    });
                });
                skip += take;
                if (data.length < take) hasMore = false;
            } else {
                hasMore = false;
            }
        } catch (e) {
            console.error("Erreur sur l'API ou JSON vide");
            hasMore = false;
        }
        if (skip > 15000) break;
    }

    novel.chapters = chapters;
    console.log("Total chapitres récupérés :", chapters.length);
    return novel;
}

    async parseChapter(chapterPath: string): Promise<string> {
        const body = await fetchText(this.site + chapterPath);
        const $ = loadCheerio(body);

        let chapterContent = "";

        $('.group p.whitespace-pre-wrap').each((i, el) => {
            const paragraph = $(el).html();
            if (paragraph) {
                chapterContent += `<p>${paragraph}</p>`;
            }
        });

        if (!chapterContent) {
            chapterContent = $('.leading-relaxed').html() || "";
        }

        return chapterContent;
    }

    async searchNovels(searchTerm: string, pageNo: number): Promise<Plugin.NovelItem[]> {
        if (pageNo !== 1) return [];
        
        const novels: Plugin.NovelItem[] = [];
        const searchUrl = `${this.site}browse?search=${encodeURIComponent(searchTerm)}`;
        
        const body = await fetchText(searchUrl);
        const $ = loadCheerio(body);

        $('a.group').each((i, el) => {
            const name = $(el).find('h3').text().trim() || $(el).find('h4').text().trim();
            const coverPath = $(el).find('img').attr('src');
            const path = $(el).attr('href');

            if (name && path) {
                if (name.toLowerCase().includes(searchTerm.toLowerCase())) {
                    let finalCover = defaultCover;
                    if (coverPath) {
                        const baseUrl = this.site.endsWith('/') ? this.site.slice(0, -1) : this.site;
                        const cleanPath = coverPath.startsWith('/') ? coverPath : '/' + coverPath;
                        finalCover = coverPath.startsWith('http') ? coverPath : baseUrl + cleanPath;
                    }

                    novels.push({
                        name,
                        cover: finalCover,
                        path: path.replace(this.site, ''),
                    });
                }
            }
        });

        return novels;
    }
    
    resolveUrl = (path: string, isNovel?: boolean) => {
        return this.site + path;
    };
}

export default new TemplatePlugin();