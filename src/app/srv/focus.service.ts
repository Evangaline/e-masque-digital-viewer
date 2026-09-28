import { Injectable } from '@angular/core';

import { electronAPI } from './electron';

//FOCAL POINT AS A FRACTION (0-1) OF THE DISPLAYED (EXIF ROTATED) IMAGE, width/height ARE THE DISPLAYED PIXEL SIZE
export interface FocalPoint {
  x: number;
  y: number;
  width: number;
  height: number;
  source: string;
}

//LONGEST SIDE THE IMAGE IS SCALED TO BEFORE ANALYSIS, KEEPS DETECTION FAST ON LARGE PHOTOS
const ANALYSIS_SIZE: number = 1024;
//THE PRIMARY FACES ARE THE MOST CONFIDENT FACE PLUS ANY OTHER FACE SCORING WITHIN THIS MARGIN OF IT (COUPLES, GROUPS)
const PRIMARY_SCORE_MARGIN: number = 0.1;
//MINIMUM CONFIDENCE FOR A FACE ON THE WHOLE IMAGE, AND (STRICTER) ON A TILE WHERE FALSE POSITIVES ARE MORE LIKELY
const MIN_FACE_SCORE: number = 0.5;
const MIN_TILE_FACE_SCORE: number = 0.7;
//TILE SIZE AS A FRACTION OF THE SHORTER IMAGE SIDE FOR THE SMALL FACE SCAN
const TILE_FRACTION: number = 0.5;
//HOW LONG TO WAIT BEFORE WRITING NEW CACHE ENTRIES TO DISK
const CACHE_SAVE_DELAY: number = 5000;

@Injectable({
  providedIn: 'root'
})
export class FocusService {

  private cache: { [path: string]: FocalPoint } = {};
  private cacheLoaded: Promise<void>;
  private cacheSaveTimer: any = null;
  private pending: { [path: string]: Promise<FocalPoint | null> } = {};
  private detector: Promise<any> | null = null;

  constructor() {
    this.cacheLoaded = electronAPI().invoke('load-focus-cache').then(json => {
      if ((json != null) && (json != "")) {
        try {
          this.cache = JSON.parse(json);
        }
        catch (error) {
          console.log(error);
        }
      }
    }).catch(error => console.log(error));
  }

  //RETURNS THE CACHED FOCAL POINT WITHOUT ANALYSING
  public cached(path: string): FocalPoint | null {
    return this.cache[path] || null;
  }

  //FINDS THE FOCAL POINT FOR AN IMAGE, RESULTS ARE CACHED (IN MEMORY AND ON DISK)
  public getFocalPoint(path: string, screenWidth: number, screenHeight: number): Promise<FocalPoint | null> {
    if (this.pending[path] != null) {
      return this.pending[path];
    }
    let result = this.cacheLoaded.then(() => {
      if (this.cache[path] != null) {
        return this.cache[path];
      }
      return this.analyse(path, screenWidth, screenHeight).then(fp => {
        if (fp != null) {
          this.cache[path] = fp;
          this.scheduleCacheSave();
        }
        return fp;
      });
    }).catch(error => {
      console.log(error);
      return null;
    }).finally(() => {
      delete this.pending[path];
    });
    this.pending[path] = result;
    return result;
  }

  //CSS FOR AN <img> THAT COVERS THE SCREEN WITH THE FOCAL POINT AS CLOSE TO THE CENTER AS THE CROP ALLOWS
  public coverStyle(fp: FocalPoint | null, screenWidth: number, screenHeight: number): string {
    let px: number = 50;
    let py: number = 50;
    if ((fp != null) && (fp.width > 0) && (fp.height > 0)) {
      let scale: number = Math.max(screenWidth / fp.width, screenHeight / fp.height);
      px = this.axisPercent(fp.x, fp.width * scale, screenWidth);
      py = this.axisPercent(fp.y, fp.height * scale, screenHeight);
    }
    return "display:block;width:100%;height:100%;object-fit:cover;object-position:" + px.toFixed(2) + "% " + py.toFixed(2) + "%;";
  }

  //object-position PERCENTAGE THAT PUTS focus (0-1) IN THE MIDDLE OF THE SCREEN, CLAMPED SO NO EMPTY SPACE SHOWS
  private axisPercent(focus: number, scaled: number, screen: number): number {
    let overflow: number = scaled - screen;
    if (overflow <= 0.5) {
      return 50;
    }
    let offset: number = (focus * scaled) - (screen / 2);
    return Math.min(1, Math.max(0, offset / overflow)) * 100;
  }

  private async analyse(path: string, screenWidth: number, screenHeight: number): Promise<FocalPoint | null> {
    let img: HTMLImageElement = await this.loadImage(path);
    //naturalWidth/naturalHeight ARE ALREADY EXIF ROTATED, THE CANVAS GETS THE ROTATED PIXELS
    let width: number = img.naturalWidth;
    let height: number = img.naturalHeight;
    if ((width == 0) || (height == 0)) {
      return null;
    }
    let ratio: number = Math.min(1, ANALYSIS_SIZE / Math.max(width, height));
    let canvas: HTMLCanvasElement = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);

    //1. FACES
    let faces: any[] = await this.detectFaces(canvas);
    if (faces.length > 0) {
      let best: number = Math.max(...faces.map(f => f.score));
      let primary: any[] = faces.filter(f => f.score >= (best - PRIMARY_SCORE_MARGIN));
      let left: number = Math.min(...primary.map(f => f.originX));
      let top: number = Math.min(...primary.map(f => f.originY));
      let right: number = Math.max(...primary.map(f => f.originX + f.width));
      let bottom: number = Math.max(...primary.map(f => f.originY + f.height));
      return {
        x: this.clamp01(((left + right) / 2) / canvas.width),
        y: this.clamp01(((top + bottom) / 2) / canvas.height),
        width: width,
        height: height,
        source: "face"
      };
    }

    //2. NO FACES, USE SMARTCROP (DETAIL, SKIN TONE AND SATURATION) FOR THE SCREEN SHAPE
    let smartcrop: any = await import('smartcrop');
    smartcrop = smartcrop.default || smartcrop;
    let result = await smartcrop.crop(canvas, { width: Math.max(1, screenWidth), height: Math.max(1, screenHeight), minScale: 1.0 });
    let crop = result.topCrop;
    return {
      x: this.clamp01((crop.x + crop.width / 2) / canvas.width),
      y: this.clamp01((crop.y + crop.height / 2) / canvas.height),
      width: width,
      height: height,
      source: "smartcrop"
    };
  }

  //THE MODEL WORKS ON A SMALL (128px) INPUT SO SMALL FACES IN FULL BODY SHOTS ARE MISSED ON THE WHOLE IMAGE,
  //WHEN THAT HAPPENS SCAN OVERLAPPING TILES SO EACH FACE IS LARGER RELATIVE TO THE MODEL INPUT
  private async detectFaces(canvas: HTMLCanvasElement): Promise<any[]> {
    try {
      let detector = await this.getDetector();
      if (detector == null) {
        return [];
      }
      let faces: any[] = this.detectBoxes(detector, canvas, 0, 0, MIN_FACE_SCORE);
      if (faces.length > 0) {
        return faces;
      }

      let tileSize: number = Math.round(Math.min(canvas.width, canvas.height) * TILE_FRACTION);
      let step: number = Math.max(1, Math.round(tileSize / 2));
      let tile: HTMLCanvasElement = document.createElement('canvas');
      tile.width = tileSize;
      tile.height = tileSize;
      let ctx = tile.getContext('2d')!;
      for (let y = 0; y + tileSize <= canvas.height + step - 1; y += step) {
        for (let x = 0; x + tileSize <= canvas.width + step - 1; x += step) {
          let tx: number = Math.min(x, canvas.width - tileSize);
          let ty: number = Math.min(y, canvas.height - tileSize);
          ctx.clearRect(0, 0, tileSize, tileSize);
          ctx.drawImage(canvas, tx, ty, tileSize, tileSize, 0, 0, tileSize, tileSize);
          faces.push(...this.detectBoxes(detector, tile, tx, ty, MIN_TILE_FACE_SCORE));
        }
      }
      return faces;
    }
    catch (error) {
      console.log(error);
      return [];
    }
  }

  //FACE BOXES ABOVE minScore, OFFSET BACK INTO THE FULL CANVAS COORDINATES
  private detectBoxes(detector: any, source: HTMLCanvasElement, offsetX: number, offsetY: number, minScore: number): any[] {
    let result = detector.detect(source);
    return result.detections
      .filter((d: any) => (d.boundingBox != null) && ((d.categories?.[0]?.score ?? 0) >= minScore))
      .map((d: any) => ({
        originX: d.boundingBox.originX + offsetX,
        originY: d.boundingBox.originY + offsetY,
        width: d.boundingBox.width,
        height: d.boundingBox.height,
        score: d.categories[0].score
      }));
  }

  //LOADS MEDIAPIPE AND THE FACE MODEL ONCE, FROM THE LOCAL ASSETS (NO NETWORK)
  private getDetector(): Promise<any> {
    if (this.detector == null) {
      this.detector = (async () => {
        let vision = await import('@mediapipe/tasks-vision');
        let fileset = await vision.FilesetResolver.forVisionTasks(new URL('assets/mediapipe', document.baseURI).href);
        return await vision.FaceDetector.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: new URL('assets/models/blaze_face_short_range.tflite', document.baseURI).href,
            delegate: 'CPU'
          },
          runningMode: 'IMAGE',
          minDetectionConfidence: 0.5
        });
      })().catch(error => {
        console.log(error);
        return null;
      });
    }
    return this.detector;
  }

  private loadImage(path: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      let img: HTMLImageElement = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Unable to load image: " + path));
      img.src = this.fileUrl(path);
    });
  }

  private fileUrl(path: string): string {
    let p: string = path.replace(/\\/g, "/");
    if (!p.startsWith("/")) {
      p = "/" + p;
    }
    return "file://" + encodeURI(p).replace(/#/g, "%23").replace(/\?/g, "%3F");
  }

  private clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
  }

  private scheduleCacheSave(): void {
    if (this.cacheSaveTimer != null) {
      return;
    }
    this.cacheSaveTimer = setTimeout(() => {
      this.cacheSaveTimer = null;
      electronAPI().invoke('save-focus-cache', JSON.stringify(this.cache));
    }, CACHE_SAVE_DELAY);
  }
}
