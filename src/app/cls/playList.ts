
export class PlayListItem {
  public sequence: number = 0;
  public path: string = "";

  constructor() {
    this.sequence = 0;
    this.path = "";
  }

  public name(): string {
    let fAry: string[] = this.path.split("/");
    console.log(fAry.length);
    console.log(fAry[0]);

    return fAry[fAry.length - 1];
  }

  static fromJSON(json: Object): PlayListItem {
    let obj = Object.create(PlayListItem.prototype);
    let bWrapper = Object.assign(obj, json);;

    return bWrapper;
  }
}
