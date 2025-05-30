
import { PlayListItem } from './playList';

export class Prefereneces {
  public playlist: PlayListItem[] = [];
  public directories: DirectoryEntry[] = [];
  public timer: number = 60;
  public crop: boolean = false;
  public useimage: boolean = true;
  public backColor: string = "#232425";
  public interval: string = "M";
  public position: string = "CENTER";
  public orderby: string = "CREATED";
  public direction: string = "ASC";
  public lastPlayed: string = "";

  constructor() {
    this.playlist = [];
    this.directories = [];
    this.directories.push(new DirectoryEntry());
    this.timer = 60;
    this.crop = false;
    this.useimage = true;
    this.backColor = "#232425";
    this.interval = "M";
    this.orderby = "CREATED";
    this.direction = "ASC";
    this.lastPlayed = "";
    this.position = "CENTER"
}

  static fromJSON(json: Object): Prefereneces {
    let obj = Object.create(Prefereneces.prototype);
    let bWrapper = Object.assign(obj, json);;

    let vList: PlayListItem[] = [];
    let values = bWrapper.playlist;
    for (let i in values) {
      vList.push(PlayListItem.fromJSON(values[i]));
    }
    bWrapper.playlist = vList;

    let vList1: DirectoryEntry[] = [];
    let values1 = bWrapper.directories;
    for (let i in values1) {
      vList1.push(DirectoryEntry.fromJSON(values1[i]));
    }
    bWrapper.directories = vList1;

    return bWrapper;
  }
}

export class DirectoryEntry {
  public path: string = "";
  public include: boolean = false;

  constructor() {
    this.path = "";
    this.include = true;
  }

  static fromJSON(json: Object): DirectoryEntry {
    let obj = Object.create(DirectoryEntry.prototype);
    let bWrapper = Object.assign(obj, json);;

    return bWrapper;
  }
}
