import {
    Component,
    OnInit,
    OnDestroy,
    HostListener,
    ChangeDetectorRef,
    ChangeDetectionStrategy,
} from '@angular/core';
import { Router } from '@angular/router';
import { timer, Subscription } from 'rxjs';

import {
    Prefereneces,
    PlayListItem,
    DirectoryEntry,
    DirectoryGroup,
} from '../cls/index';
import {
    PreferenceService,
    PlaylistService,
    FocusService,
    electronAPI,
} from '../srv/index';

//TRANSITIONS ONLY PLAY WHEN EACH IMAGE IS SHOWN FOR LONGER THAN THIS MANY SECONDS
const TRANSITION_MIN_INTERVAL: number = 10;
//LENGTH OF A TRANSITION IN MILLISECONDS (THE CSS ANIMATIONS READ IT FROM --tr-duration)
const TRANSITION_DURATION: number = 1500;
//START THE TRANSITION ANYWAY IF THE NEXT IMAGE IS NOT READY BY THEN
const TRANSITION_READY_TIMEOUT: number = 3000;
//TRANSITIONS PICKED FROM WHEN THE SETTING IS RANDOM
const TRANSITIONS: string[] = ['FADE', 'BLACK', 'SLIDE_LEFT', 'SLIDE_UP', 'ZOOM', 'WIPE'];

//THE OUTGOING IMAGE, KEPT ON SCREEN ON ITS OWN LAYER DURING A TRANSITION
interface SlideSnapshot {
    image: string;
    imageDisplay: string;
    backgroundImage: string;
    alignAdjustment: string;
}

@Component({
    selector: 'app-viewer',
    standalone: false,
    changeDetection: ChangeDetectionStrategy.Eager,
    templateUrl: './viewer.component.html',
})
export class ViewerComponent implements OnInit, OnDestroy {
    title = 'E-MASQUE Interactive - Digital Picture';

    private timerSubscription: Subscription | undefined;
    private prefSubscription: Subscription | undefined;
    private removeListeners: (() => void)[] = [];
    private isBuilding: boolean = false;
    private initialBuild: boolean = false;
    private time: number = 60;

    public preferences: Prefereneces = new Prefereneces();
    public maxCount: number = 0;
    public isPaused: boolean = false;
    public showPlay: boolean = false;
    public groupMenuOpen: boolean = false;
    public timeLeft: number = 10;

    public image: string = '';
    public windowWidth: number = window.innerWidth;
    public windowHeight: number = window.innerHeight;
    //SET IN ngOnInit, PREFERENCES CAN ARRIVE IN THE CONSTRUCTOR BEFORE THE VIEW EXISTS
    private initialised: boolean = false;
    public imageDisplay: string = 'width:200px';
    public backgroundImage: string = '';

    //COPY OF THE PLAY LIST SHOWN IN THE UP NEXT DRAWER (A NEW ARRAY EACH TIME SO THE VIRTUAL LIST UPDATES)
    public upNext: PlayListItem[] = [];
    public cursorTimer: any;
    //CONTROLS AND CURSOR HIDE AFTER THIS MANY MILLISECONDS WITHOUT MOUSE OR KEYBOARD ACTIVITY
    public cursorTimerDuration = 3000;
    public controlsVisible: boolean = true;
    public hoverControls: boolean = false;
    public isFullScreen: boolean = false;
    public alignAdjustment: string = '';

    public outgoing: SlideSnapshot | null = null;
    public outgoingClass: string = '';
    public incomingClass: string = '';
    public transitionDuration: number = TRANSITION_DURATION;
    private transitionTimer: any = null;
    private transitionId: number = 0;

    @HostListener('window:resize', ['$event'])
    onResize(event: any) {
        this.updateWindowSize();
    }

    @HostListener('window:mousemove', ['$event'])
    onMouseMove(event: any) {
        this.resetTimer();
    }
    @HostListener('window:mousedown', ['$event'])
    onMouseDown(event: any) {
        this.resetTimer();
    }
    @HostListener('window:mouseup', ['$event'])
    onMouseUp(event: any) {
        this.resetTimer();
    }
    @HostListener('window:wheel', ['$event'])
    onWheel(event: any) {
        this.resetTimer();
    }
    @HostListener('window:touchstart', ['$event'])
    onTouchStart(event: any) {
        this.resetTimer();
    }
    //SPACE PLAY/PAUSE, ARROWS PREVIOUS/NEXT, F FULL SCREEN, ESC LEAVE FULL SCREEN
    @HostListener('window:keydown', ['$event'])
    onKeyDown(event: KeyboardEvent) {
        this.resetTimer();
        let target = event.target as HTMLElement;
        if (target != null && (target.tagName == 'INPUT' || target.tagName == 'TEXTAREA')) {
            return;
        }
        //THE GROUP MENU HANDLES ITS OWN KEYS
        if (this.groupMenuOpen == true) {
            return;
        }
        //LET A FOCUSED BUTTON HANDLE ITS OWN SPACE/ENTER
        if (target != null && target.tagName == 'BUTTON' && (event.key == ' ' || event.key == 'Enter')) {
            return;
        }
        switch (event.key) {
            case ' ':
                this.togglePlay();
                break;
            case 'ArrowRight':
                this.showNextPicture();
                break;
            case 'ArrowLeft':
                this.showPreviousPicture();
                break;
            case 'f':
            case 'F':
                this.toggleFullScreen();
                break;
            case 'Escape':
                if (this.showPlay) {
                    this.closePlaylist();
                } else if (this.isFullScreen) {
                    electronAPI().invoke('set-fullscreen', false);
                }
                break;
            default:
                return;
        }
        event.preventDefault();
    }

    constructor(
        private router: Router,
        private ref: ChangeDetectorRef,
        private prefService: PreferenceService,
        private playlistService: PlaylistService,
        private focusService: FocusService,
    ) {
        this.image = '';
        this.prefSubscription = this.prefService.getPreferences$.subscribe(
            (pref) => this.setPreferences(pref),
        );

        this.removeListeners.push(electronAPI().on('start', () => this.play()));
        this.removeListeners.push(
            electronAPI().on('pause', () => this.pause()),
        );
        this.removeListeners.push(
            electronAPI().on('next', () => this.showNextPicture()),
        );
        this.removeListeners.push(
            electronAPI().on('fullscreen-on', () => this.setFullScreenState(true)),
        );
        this.removeListeners.push(
            electronAPI().on('fullscreen-off', () => this.setFullScreenState(false)),
        );
        electronAPI()
            .invoke('is-fullscreen')
            .then((full) => this.setFullScreenState(full == true));
    }

    ngOnDestroy() {
        this.stopTimer();
        clearTimeout(this.cursorTimer);
        this.showCursor();
        clearTimeout(this.transitionTimer);
        this.prefSubscription?.unsubscribe();
        this.removeListeners.forEach((remove) => remove());
        this.removeListeners = [];
    }

    ngOnInit() {
        this.windowWidth = window.innerWidth;
        this.windowHeight = window.innerHeight;

        //SHOW THE CONTROLS BRIEFLY ON OPEN, THEN HIDE THEM
        this.resetTimer();
        this.initialised = true;
        this.begin();
    }
    public begin(): void {
        if (this.initialised == false || this.image != '') {
            return;
        }
        if (
            this.preferences.playlist != null &&
            this.preferences.playlist.length > 0
        ) {
            this.showNextPicture();
            this.updateWindowSize();
            this.start();
        } else if (this.initialBuild == false) {
            //NO SAVED PLAY LIST, BUILD ONE FROM THE DIRECTORIES (ONCE, SO AN EMPTY GROUP DOES NOT RESCAN ON EVERY SAVE)
            this.initialBuild = this.createPlaylist(true);
        }
    }

    public setPreferences(pref: Prefereneces): void {
        this.preferences = Prefereneces.fromJSON(pref);
        let seconds: number = Number(this.preferences.timer);
        if (this.preferences.interval == 'M') {
            seconds = 60 * seconds;
        }
        //INVALID OR ZERO INTERVAL FALLS BACK TO ONE MINUTE
        if (!(seconds >= 1)) {
            seconds = 60;
        }
        this.time = Math.round(seconds);
        this.timeLeft = this.time;

        this.refreshUpNext();
        this.begin();
    }
    //DIRECTORIES OF THE CURRENT GROUP, FALLS BACK TO THE ORIGINAL DIRECTORY LIST WHEN NO GROUP IS SELECTED
    public playlistDirectories(): DirectoryEntry[] {
        let dirs: DirectoryEntry[] = this.preferences.directories || [];
        if (this.preferences.groups != null) {
            for (let j = 0; j < this.preferences.groups.length; j++) {
                if (
                    this.preferences.groups[j].name ==
                    this.preferences.currentGroup
                ) {
                    dirs = this.preferences.groups[j].directories || [];
                }
            }
        }
        return dirs.filter((d) => d.path != null && d.path != '');
    }
    //RETURNS TRUE WHEN A BUILD WAS STARTED
    public createPlaylist(grpChange: boolean): boolean {
        let dirs: DirectoryEntry[] = this.playlistDirectories();
        if (this.isBuilding == true || dirs.length == 0) {
            return false;
        }

        this.isBuilding = true;
        this.stopTimer();
        this.playlistService
            .buildPlaylist(
                dirs,
                this.preferences.orderby,
                this.preferences.direction,
            )
            .then((list) => {
                this.isBuilding = false;
                this.preferences.playlist = list;
                this.maxCount = list.length;
                this.savePreferences();

                if (
                    list.length > 0 &&
                    (grpChange == true || this.image == '')
                ) {
                    this.showNextPicture();
                } else {
                    this.start();
                }
            })
            .catch((error) => {
                this.isBuilding = false;
                console.log(error);
                this.start();
            });
        return true;
    }
    public loadPlaylist(): void {
        if (
            this.preferences.playlist == null ||
            this.preferences.playlist.length == 0
        ) {
            this.createPlaylist(false);
        }
    }
    public clearPlaylist(): void {
        this.preferences.playlist = [];
        this.savePreferences();
    }
    //OPENS OR CLOSES THE UP NEXT DRAWER
    public printPlaylist(): void {
        this.showPlay = !this.showPlay;
        this.refreshUpNext();
        this.ref.detectChanges();
    }
    public closePlaylist(): void {
        this.showPlay = false;
        this.ref.detectChanges();
    }
    private refreshUpNext(): void {
        this.upNext = (this.preferences.playlist || []).slice();
    }
    //MOVES THE IMAGE TO THE FRONT OF THE PLAY LIST AND SHOWS IT, THE REST OF THE LIST IS KEPT
    public showNow(file: PlayListItem): void {
        let idx: number = this.preferences.playlist.indexOf(file);
        if (idx == -1) {
            return;
        }
        this.preferences.playlist.splice(idx, 1);
        this.preferences.playlist.unshift(file);
        this.showNextPicture();
    }
    public fileName(path: string): string {
        let parts: string[] = (path || '').split(/[\\/]/);
        return parts[parts.length - 1];
    }
    public setMenuOpen(open: boolean): void {
        this.groupMenuOpen = open;
        this.resetTimer();
    }
    private savePreferences(): void {
        electronAPI().invoke('save-file', JSON.stringify(this.preferences));
        this.prefService.setPreferences(this.preferences);
    }

    public start(): void {
        this.isPaused = false;
        if (!this.timerSubscription || this.timerSubscription.closed == true) {
            this.startTimer();
        }
    }
    public startTimer() {
        this.timerSubscription = timer(1000, 1000).subscribe(() => {
            this.timeLeft -= 1;
            if (this.timeLeft <= 0) {
                this.timeLeft = this.time;
                this.showNextPicture();
            }
            this.ref.detectChanges();
        });
    }
    public stopTimer() {
        this.timeLeft = this.time;
        if (this.timerSubscription) {
            this.timerSubscription.unsubscribe();
        }
    }

    public showPreviousPicture(): void {
        if (
            this.preferences.lastPlayed == null ||
            this.preferences.lastPlayed == ''
        ) {
            return;
        }
        //PUT THE CURRENT IMAGE BACK AT THE FRONT SO IT IS NOT LOST
        if (this.image != '') {
            let pItem: PlayListItem = new PlayListItem();
            pItem.path = this.image;
            this.preferences.playlist.unshift(pItem);
        }
        let transition: string = this.beginTransition();
        this.image = this.preferences.lastPlayed;
        this.preferences.lastPlayed = '';
        this.stopTimer();
        this.runTransition(transition, this.positionImage());
        this.startTimer();
    }
    public showNextPicture(): void {
        if (
            this.preferences.playlist == null ||
            this.preferences.playlist.length == 0
        ) {
            //NOTHING LEFT TO SHOW, REBUILD FROM THE DIRECTORIES
            this.createPlaylist(false);
            return;
        }

        this.stopTimer();
        let transition: string = this.beginTransition();
        this.preferences.lastPlayed = this.image;
        let item: PlayListItem = this.preferences.playlist.splice(0, 1)[0];
        this.image = item.path;

        if (this.playlistDirectories().length == 0) {
            //NO DIRECTORIES TO REBUILD FROM, KEEP LOOPING THE CURRENT LIST
            this.preferences.playlist.push(item);
        }

        if (this.preferences.playlist.length == 0) {
            this.createPlaylist(false);
        } else {
            this.savePreferences();
        }

        this.runTransition(transition, this.positionImage());
        this.start();
    }

    //WHICH TRANSITION TO PLAY, NONE WHEN SWITCHED OFF OR THE INTERVAL IS TOO SHORT
    private transitionType(): string {
        let type: string = this.preferences.transition || 'FADE';
        if (type == 'NONE' || this.time <= TRANSITION_MIN_INTERVAL) {
            return 'NONE';
        }
        if (type == 'RANDOM') {
            type = TRANSITIONS[Math.floor(Math.random() * TRANSITIONS.length)];
        }
        return type;
    }
    //CALL BEFORE CHANGING THE IMAGE, KEEPS THE CURRENT IMAGE ON TOP WHILE THE NEXT ONE IS PREPARED UNDERNEATH
    private beginTransition(): string {
        this.finishTransition();
        let type: string = this.transitionType();
        if (type == 'NONE' || this.image == '') {
            return 'NONE';
        }
        this.outgoing = {
            image: this.image,
            imageDisplay: this.imageDisplay,
            backgroundImage: this.backgroundImage,
            alignAdjustment: this.alignAdjustment,
        };
        this.outgoingClass = 'outgoing';
        this.incomingClass = 'incoming';
        this.ref.detectChanges();
        return type;
    }
    //ANIMATES BETWEEN THE TWO LAYERS ONCE THE NEW IMAGE IS LOADED AND POSITIONED
    private runTransition(type: string, positioned: Promise<void>): void {
        if (type == 'NONE') {
            return;
        }
        let id: number = ++this.transitionId;
        let ready = Promise.all([positioned, this.decodeImage(this.image)]);
        let timeout = new Promise((resolve) =>
            setTimeout(resolve, TRANSITION_READY_TIMEOUT),
        );
        Promise.race([ready, timeout]).then(() => {
            if (id != this.transitionId || this.outgoing == null) {
                return;
            }
            let cls: string = 'tr-' + type.toLowerCase().replace('_', '-');
            this.outgoingClass = 'outgoing ' + cls;
            this.incomingClass = 'incoming ' + cls;
            this.ref.detectChanges();
            this.transitionTimer = setTimeout(
                () => this.finishTransition(),
                TRANSITION_DURATION + 100,
            );
        });
    }
    //REMOVES THE OUTGOING LAYER, ALSO CUTS SHORT A TRANSITION THAT IS STILL RUNNING
    public finishTransition(): void {
        this.transitionId++;
        clearTimeout(this.transitionTimer);
        this.transitionTimer = null;
        if (this.outgoing != null || this.incomingClass != '') {
            this.outgoing = null;
            this.outgoingClass = '';
            this.incomingClass = '';
            this.ref.detectChanges();
        }
    }
    //RESOLVES WHEN THE IMAGE IS DECODED (SAME src AS THE TEMPLATE SO THE <img> USES THE CACHED RESULT)
    private decodeImage(path: string): Promise<void> {
        let img: HTMLImageElement = new Image();
        img.src = path;
        return img.decode().catch(() => undefined);
    }

    //RESOLVES ONCE THE IMAGE HAS BEEN POSITIONED
    public positionImage(): Promise<void> {
        if (this.image == '') {
            return Promise.resolve();
        }
        if (
            this.preferences.crop == true &&
            this.preferences.position == 'SMART'
        ) {
            return this.smartPosition();
        }
        return this.advancedPosition();
    }
    //FILL THE SCREEN, CENTERED ON THE FACES OR MAIN SUBJECT OF THE IMAGE
    public smartPosition(): Promise<void> {
        let path: string = this.image;
        this.alignAdjustment = '';
        this.backgroundImage = '';

        let cached = this.focusService.cached(path);
        this.imageDisplay = this.focusService.coverStyle(
            cached,
            this.windowWidth,
            this.windowHeight,
        );
        this.ref.detectChanges();

        let analysed: Promise<any> = Promise.resolve();
        if (cached == null) {
            //SHOW CENTERED UNTIL THE ANALYSIS IS DONE
            analysed = this.focusService
                .getFocalPoint(path, this.windowWidth, this.windowHeight)
                .then((fp) => {
                    if (this.image == path) {
                        this.imageDisplay = this.focusService.coverStyle(
                            fp,
                            this.windowWidth,
                            this.windowHeight,
                        );
                        this.ref.detectChanges();
                    }
                });
        }

        //ANALYSE THE NEXT IMAGE IN THE BACKGROUND SO IT IS READY WHEN SHOWN
        return analysed.then(() => {
            if (
                this.preferences.playlist != null &&
                this.preferences.playlist.length > 0
            ) {
                this.focusService.getFocalPoint(
                    this.preferences.playlist[0].path,
                    this.windowWidth,
                    this.windowHeight,
                );
            }
        }).catch((error) => console.log(error));
    }
    public basicPosition() {
        this.alignAdjustment = 'text-align:center;';
        this.imageDisplay = 'position:relative;height:100%;';

        this.backgroundImage = '';
        if (this.preferences.useimage == true) {
            let path: string = this.image.replace(/\\/g, '/');
            this.backgroundImage = 'background-image:url("file:' + path + '")';
            this.backgroundImage += ';background-repeat:no-repeat';
            this.backgroundImage += ';background-position: center';
            this.backgroundImage += ';background-size: cover';
        }
    }
    public advancedPosition(): Promise<void> {
        return electronAPI()
            .invoke('get-image-dimensions', this.image)
            .then((dimensions) => {
                return electronAPI()
                    .invoke('get-image-orientation', this.image)
                    .then((orientation) => {
                        dimensions.orientation = orientation;

                        //ONLY ORIENTATIONS 5-8 ARE ROTATED 90 DEGREES (WIDTH AND HEIGHT SWAPPED), EVERYTHING ELSE LAYS OUT AS NORMAL
                        if (!(
                            dimensions.orientation >= 5 &&
                            dimensions.orientation <= 8
                        )) {
                            dimensions.orientation = 1;
                        }

                        //1: Normal orientation (no rotation).
                        //3: 180-degree rotation (laid out as normal).
                        //6: 90-degree clockwise rotation.
                        //8: 90-degree counter-clockwise rotation.
                        this.alignAdjustment = '';
                        this.backgroundImage = '';
                        if (this.preferences.useimage == true) {
                            let path: string = this.image.replace(/\\/g, '/');
                            //console.log(path);
                            this.backgroundImage =
                                'background-image:url("file:' + path + '")';
                            this.backgroundImage +=
                                ';background-repeat:no-repeat';
                            this.backgroundImage +=
                                ';background-position: center';
                            this.backgroundImage += ';background-size: cover';
                        }

                        //console.log("O: " + dimensions.orientation);
                        //console.log("Image: " + this.image);
                        //console.log("W Height: " + this.windowHeight);
                        //console.log("W Width: " + this.windowWidth);
                        //console.log("I Width: " + dimensions.width);
                        //console.log("I Height: " + dimensions.height);
                        //console.log("Crop: " + this.preferences.crop);

                        if (this.preferences.crop == true) {
                            if (dimensions.width == 0) {
                                this.basicPosition();
                            } else {
                                //console.log("0");

                                let w1: number = this.windowWidth;
                                let h1: number =
                                    (this.windowWidth / dimensions.width) *
                                    dimensions.height;

                                //console.log("0a");

                                if (dimensions.orientation == 1) {
                                    if (this.windowHeight > h1) {
                                        //console.log("1");
                                        let w2: number =
                                            (this.windowHeight /
                                                dimensions.height) *
                                            dimensions.width;

                                        if (w2 < this.windowWidth) {
                                            //console.log("1a");
                                            let h2: number =
                                                (this.windowWidth /
                                                    dimensions.width) *
                                                dimensions.height;

                                            this.imageDisplay =
                                                'position:relative;width:100%;';
                                            if (
                                                this.preferences.position ==
                                                'CENTER'
                                            ) {
                                                let tp: number =
                                                    (h2 - this.windowHeight) /
                                                    2;
                                                this.imageDisplay +=
                                                    'top:-' +
                                                    tp +
                                                    'px;left:0px;';
                                            } else {
                                                this.imageDisplay +=
                                                    'top:0px;left:0px;';
                                            }
                                        } else {
                                            //console.log("1b");
                                            this.imageDisplay =
                                                'position:relative;height:100%;';
                                            let lft: number =
                                                (w2 - this.windowWidth) / 2;
                                            this.imageDisplay +=
                                                'top:0px;left:-' + lft + 'px;';
                                        }
                                    } else {
                                        //console.log("2");
                                        let h3: number =
                                            (this.windowWidth /
                                                dimensions.width) *
                                            dimensions.height;
                                        this.imageDisplay =
                                            'position:relative;width:100%;';
                                        if (
                                            this.preferences.position ==
                                            'CENTER'
                                        ) {
                                            let tp: number =
                                                (h3 - this.windowHeight) / 2;
                                            this.imageDisplay +=
                                                'top:-' + tp + 'px;left:0px;';
                                        } else {
                                            this.imageDisplay +=
                                                'top:0px;left:0px;';
                                        }
                                    }
                                } else {
                                    if (this.windowHeight > h1) {
                                        //console.log("4");
                                        let w2: number =
                                            (this.windowHeight /
                                                dimensions.width) *
                                            dimensions.height;

                                        if (w2 < this.windowWidth) {
                                            //console.log("4a");
                                            let h2: number =
                                                (this.windowWidth /
                                                    dimensions.height) *
                                                dimensions.width;

                                            this.imageDisplay =
                                                'position:relative;width:100%;';
                                            let tp: number =
                                                (h2 - this.windowHeight) / 2;
                                            this.imageDisplay +=
                                                'top:-' + tp + 'px;left:0px;';
                                        } else {
                                            //console.log("4b");
                                            this.imageDisplay =
                                                'position:relative;height:100%;';
                                            let lft: number =
                                                (w2 - this.windowWidth) / 2;
                                            this.imageDisplay +=
                                                'top:0px;left:-' + lft + 'px;';
                                        }
                                    } else {
                                        //console.log("5");
                                        let h3: number =
                                            (this.windowWidth /
                                                dimensions.height) *
                                            dimensions.width;
                                        this.imageDisplay =
                                            'position:relative;width:100%;';
                                        let tp: number =
                                            (h3 - this.windowHeight) / 2;
                                        this.imageDisplay +=
                                            'top:-' + tp + 'px;left:0px;';
                                    }
                                }
                            }
                        } else {
                            //console.log("6");
                            if (dimensions.orientation == 1) {
                                //LANDSCAPE
                                let percent1: number =
                                    this.windowHeight / dimensions.height;
                                let w2a: number = percent1 * dimensions.width;
                                //let h2a: number = percent1 * dimensions.height;

                                if (w2a > this.windowWidth) {
                                    //console.log("6a");
                                    this.imageDisplay =
                                        'position:relative;height:100%;';
                                    if (dimensions.width == 0) {
                                        this.imageDisplay += 'top:0px;';
                                        this.alignAdjustment =
                                            'text-align:center;';
                                    } else {
                                        let lft2: number =
                                            (w2a - this.windowWidth) / 2;
                                        this.imageDisplay +=
                                            'top:0px;left:-' + lft2 + 'px;';
                                    }
                                } else {
                                    //console.log("6b");
                                    this.imageDisplay =
                                        'position:relative;height:100%;';
                                    if (dimensions.width == 0) {
                                        this.imageDisplay += 'top:0px;';
                                        this.alignAdjustment =
                                            'text-align:center;';
                                    } else {
                                        let lft2: number =
                                            (this.windowWidth - w2a) / 2;
                                        this.imageDisplay +=
                                            'top:0px;left:' + lft2 + 'px;';
                                    }
                                }
                            } else {
                                //console.log("7");
                                //PORTRAIT
                                let percent2: number =
                                    this.windowHeight / dimensions.width;

                                let w2b: number = percent2 * dimensions.height;
                                //let h2b: number = percent2 * dimensions.width;

                                if (w2b > this.windowWidth) {
                                    //console.log("7a");
                                    this.imageDisplay =
                                        'position:relative;height:100%;';
                                    let lft2: number =
                                        (w2b - this.windowWidth) / 2;
                                    this.imageDisplay +=
                                        'top:0px;left:-' + lft2 + 'px;';
                                } else {
                                    //console.log("7b");
                                    this.imageDisplay =
                                        'position:relative;height:100%;';
                                    let lft2: number =
                                        (this.windowWidth - w2b) / 2;
                                    this.imageDisplay +=
                                        'top:0px;left:' + lft2 + 'px;';
                                }
                            }
                        }

                        this.ref.detectChanges();
                    });
            })
            .catch((error) => console.log(error));
    }

    public updateWindowSize() {
        this.windowWidth = window.innerWidth;
        this.windowHeight = window.innerHeight;
        //console.log(`Window size: ${this.windowWidth} x ${this.windowHeight}`);

        this.positionImage();
    }
    public redrawImage(): void {
        this.positionImage();
    }
    public play(): void {
        this.start();
        this.ref.detectChanges();
    }
    public togglePlay(): void {
        if (this.isPaused == true) {
            this.play();
        } else {
            this.pause();
        }
    }
    public toggleFullScreen(): void {
        electronAPI().invoke('set-fullscreen', !this.isFullScreen);
    }
    private setFullScreenState(full: boolean): void {
        this.isFullScreen = full;
        this.ref.detectChanges();
    }
    public openPreferences(): void {
        this.router.navigate(['/preferences']);
    }
    //FRACTION OF THE INTERVAL THAT HAS PASSED FOR THE CURRENT IMAGE
    public progress(): number {
        if (this.time <= 0) {
            return 0;
        }
        return Math.min(1, Math.max(0, 1 - this.timeLeft / this.time));
    }
    //SECONDS AS m:ss
    public formatTime(seconds: number): string {
        let total: number = Math.max(0, Math.round(seconds));
        let m: number = Math.floor(total / 60);
        let sec: number = total % 60;
        return m + ':' + (sec < 10 ? '0' : '') + sec;
    }
    public pause(): void {
        this.isPaused = !this.isPaused;
        if (this.isPaused == true) {
            //console.log('Paused')
            this.stopTimer();
        } else {
            //console.log('Unpaused')
            this.start();
        }
        this.ref.detectChanges();
    }

    public removeFile(file: PlayListItem): void {
        let idx: number = -1;
        for (let i = 0; i < this.preferences.playlist.length; i++) {
            if (this.preferences.playlist[i] === file) {
                idx = i;
            }
        }
        if (idx != -1) {
            this.preferences.playlist.splice(idx, 1);
            this.savePreferences();
        }
    }
    public resetTimer = () => {
        this.showCursor();
        if (this.controlsVisible == false) {
            this.controlsVisible = true;
            this.ref.detectChanges();
        }
        clearTimeout(this.cursorTimer);
        this.cursorTimer = setTimeout(
            this.hideCursor,
            this.cursorTimerDuration,
        );
    };
    public hideCursor = () => {
        //KEEP THE CONTROLS UP WHILE THE MOUSE IS OVER THEM OR THE GROUP MENU / UP NEXT DRAWER IS OPEN
        if (this.hoverControls == true || this.groupMenuOpen == true || this.showPlay == true) {
            this.cursorTimer = setTimeout(this.hideCursor, this.cursorTimerDuration);
            return;
        }
        document.body.style.cursor = 'none';
        this.controlsVisible = false;
        this.ref.detectChanges();
    };
    public showCursor = () => {
        document.body.style.cursor = 'default';
    };

    public changeGroup(grp: DirectoryGroup): void {
        if (this.preferences.currentGroup != grp.name) {
            this.preferences.currentGroup = grp.name;
            this.createPlaylist(true);
        }
    }
}
