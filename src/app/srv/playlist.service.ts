import { Injectable } from '@angular/core';

import { DirectoryEntry, PlayListItem } from '../cls';
import { isImageFile, sortFiles } from '../cls/fileUtils';
import { electronAPI } from './electron';

@Injectable({
  providedIn: 'root'
})
export class PlaylistService {

  //SCANS THE DIRECTORIES IN ORDER AND RETURNS THE IMAGES FOUND, SUB FOLDERS ARE INCLUDED WHEN THE DIRECTORY IS FLAGGED
  public async buildPlaylist(directories: DirectoryEntry[], orderby: string, direction: string): Promise<PlayListItem[]> {
    let playlist: PlayListItem[] = [];
    for (let i = 0; i < directories.length; i++) {
      if ((directories[i].path != null) && (directories[i].path != "")) {
        await this.addDirectoryFiles(playlist, directories[i].path, directories[i].include, orderby, direction);
      }
    }
    return playlist;
  }

  private async addDirectoryFiles(playlist: PlayListItem[], path: string, inc: boolean, orderby: string, direction: string): Promise<void> {
    let files = await electronAPI().invoke("get-files-directories", path);
    if (!Array.isArray(files)) {
      return;
    }
    let stats: any[] = await electronAPI().invoke("get-files-directories-stats", path, files);

    let subDirs: any[] = [];
    if (inc == true) {
      subDirs = stats.filter((f: any) => f.isDirectory == true);
    }

    //GET IMAGES
    let images: any[] = stats.filter((f: any) => (f.isFile == true) && isImageFile(f.name));
    sortFiles(images, orderby, direction);

    //GENERATE LIST
    for (let j = 0; j < images.length; j++) {
      let pItem: PlayListItem = new PlayListItem();
      pItem.sequence = playlist.length + 1;
      pItem.path = path + "/" + images[j].name;
      playlist.push(pItem);
    }

    for (let j = 0; j < subDirs.length; j++) {
      await this.addDirectoryFiles(playlist, path + "/" + subDirs[j].name, inc, orderby, direction);
    }
  }
}
