// Life.js
//
// A canvas toy
// Craig Fitzgerald
//
// This version uses ES6 arrays which are much faster than the old arrays (which are really objects)
//
// you can set the cellsize and update interval using url params:
//   life.html?size=20&interval=400
//

$(function() {
   var scene = new CellLife($("#petridish"));
});


function CellLife(canvas, options){
   var self = this;

   this.Init = function(canvas, options){
      self.InitAttributes(canvas, options);
      self.InitEvents();
      self.InitState ();
   };

   this.InitAttributes = function(canvas, options){
      self.activeSet  = 0;
      self.canvas     = $(canvas).get(0);
      self.ctx        = self.canvas.getContext('2d');
      self.scratch    = document.createElement('canvas');

      self.activePos  = {x:0, y:0};
      self.startSel   = {x:0, y:0};
      self.endSel     = {x:0, y:0};
      self.fpsInfo    = $("#fps span");
      self.fps        = 0;
      self.fpsTime    = 0;
      self.fpsStep    = 0;
      self.step       = 0;
      self.states     = [];
      self.pauseMode  = 0;
      self.selecting  = 0;
      self.drawMethod = 0;
      self.autoReap   = 0;
      self.bRule      = [3];
      self.sRule      = [2,3];

      self.options = $.extend({cellSize:12, cellGap:1, interval:20}, options || {});
      self.options.cellSize = Number(self.UrlParam("size"    , self.options.cellSize));
      self.options.interval = Number(self.UrlParam("interval", self.options.interval));
      self.options.cellHue  = Math.random() * 360;
      self.options.bgHue    = Math.random() * 360;
      self.options.bgHueGap = Math.random() * 270 + 45;
      self.Resize();
   };

   this.InitEvents = function(){
      document.oncontextmenu = function(){return false};

      $(window).keydown(self.KeyDown)
               .keyup(self.KeyUp)
               .resize(self.Resize);

      $(self.canvas).mousedown(self.MouseDown)
                    .mouseup(self.MouseUp)
                    .mousemove(self.MouseMove);

      $("#rule").change(self.SetRule);
      $("#help").click(function(){$(this).hide()});
   };

   this.InitState = function(){
      self.CreateCells();
      self.interval = setInterval(self.Step, self.options.interval);
   };

   this.CreateCells = function(){
      self.ClearCellGrid();
      self.step = 0;

      var type = Math.random();
      if (type < 0.10) return self.GenerateXY();      // 10%
      if (type < 0.20) return self.GenerateXYWalk();  // 10%
      if (type < 0.35) return self.GenerateXMirror(); // 15%
                       return self.GenerateRandom();  // 65%
   };

   this.Resize = function(){
      var x = $(window).width() ;
      var y = $(window).height();
      $('body').width (x);
      $('body').height(y);
      $(self.canvas).width (x);
      $(self.canvas).height(y);
      self.canvas.width  = x;
      self.canvas.height = y;

      var newXGrid = Math.floor(self.canvas.clientWidth /(self.options.cellSize+self.options.cellGap)-1);
      var newYGrid = Math.floor(self.canvas.clientHeight/(self.options.cellSize+self.options.cellGap)-1);
      self.ResizeCellGrid(newXGrid, newYGrid);
      self.options.xGrid = newXGrid;
      self.options.yGrid = newYGrid;
   };

   this.Step = function(){
      self.Update();
      self.step++;
      self.options.cellHue += 0.5;
      self.options.bgHue   -= 0.2;
      var h = self.options.bgHueGap;
      var l = (self.drawMethod == 1 || self.options.cellSize < 5) ? "80%" : "40%";
      self.options.cellColor = self.HSL (self.options.cellHue, "75%", l);
      self.options.bgColor0  = self.HSL (self.options.bgHue+h, "65%", "15%");
      self.options.bgColor1  = self.HSL (self.options.bgHue  , "65%", "15%");
      self.Draw();
   };

   this.Update = function(){
      if (self.IsDead()) return self.CreateCells();

      for (var x=0; x<self.options.xGrid; x++){
         for (var y=0; y<self.options.yGrid; y++){
            self.WorkingCell(x, y, self.IsLive(x, y));
         }
      }
      self.AutoReap();
      self.SwapCellSet();
   };

   this.Draw = function(){
      self.DrawBackground();
      self.DrawCells();

      if (self.selecting){
         self.HilightSelection();
      } else {
         self.HilightActive();
      }
      self.DebugInfo();
      self.FpsInfo();
   };

   this.DrawCells = function(){
      self.PrepCell();
      for (var x=0; x<self.options.xGrid; x++){
         for (var y=0; y<self.options.yGrid; y++){
            if (self.Cell(x,y)) self.DrawCell(x,y);
         }
      }
   };

   this.PrepCell = function(){
      self.scratch = document.createElement('canvas');
      self.scratch.width  = self.options.cellSize;
      self.scratch.height = self.options.cellSize;
      var ctx = self.scratch.getContext('2d');
      var radius = self.options.cellSize / 2;
      var xpos   = (self.options.cellSize);
      var ypos   = (self.options.cellSize);

      var gradient = ctx.createRadialGradient(radius*5/4, radius*3/4, radius/5, radius, radius, radius);
      gradient.addColorStop(0, '#fff');
      gradient.addColorStop(0.85, self.options.cellColor);
      gradient.addColorStop(1, 'rgba(1,1,1,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, self.options.cellSize, self.options.cellSize);
   }

   this.DrawCell = function(x, y){
      var radius = self.options.cellSize / 2;
      var xpos   = (x+1) * (self.options.cellSize + self.options.cellGap);
      var ypos   = (y+1) * (self.options.cellSize + self.options.cellGap);

      if (self.drawMethod == 1 || self.options.cellSize < 5) {
         self.ctx.fillStyle = self.options.cellColor;
         self.ctx.fillRect(xpos-radius, ypos-radius, radius*2, radius*2);
      } else {
         self.ctx.drawImage(self.scratch, xpos-radius, ypos-radius);
      }
   };

   this.DrawIfPaused = function(){
      if (self.pauseMode){
         self.Draw();
      }
   };

   this.IsLive = function(x, y){
      var score = 0;
      var cell = 0;
      for (var dy=-1; dy<2; dy++){
         for (var dx=-1; dx<2; dx++){
            var state = self.NormalizedCell(x + dx, y + dy);
            if (dx == 0 && dy == 0) {
               cell = state;
            } else {
               score += state;
            }
         }
      }
      for (let b of self.bRule) {
         if (b == score) return true;
      }
      if (!cell) return false;
      for (let s of self.sRule) {
         if (s == score) return true;
      }
      return false;
   };

   this.DrawBackground = function(){
      self.bkgGradient = self.ctx.createLinearGradient(0, 0, 0, self.canvas.height);
      self.bkgGradient.addColorStop(0, self.options.bgColor0);
      self.bkgGradient.addColorStop(1, self.options.bgColor1);
      self.ctx.fillStyle = self.bkgGradient;
      self.ctx.fillRect(0, 0, self.canvas.width, self.canvas.height);
   };

   this.HilightActive = function(){
      var pos    = self.activePos;
      var radius = self.options.cellSize / 2;
      var size   = self.options.cellSize;
      var xpos   = radius + self.activePos.x * (size + self.options.cellGap);
      var ypos   = radius + self.activePos.y * (size + self.options.cellGap);
      self.ctx.fillStyle = 'rgba(255,255,255,0.3)';
      self.ctx.fillRect(xpos, ypos, size, size);
      if (self.Cell(self.activePos.x, self.activePos.y)) {
         self.DrawCell(self.activePos.x,self.activePos.y);
      }
   };

   this.HilightSelection = function(){
      var radius = self.options.cellSize / 2;
      var size = self.options.cellSize;
      var minX = Math.min(self.startSel.x, self.endSel.x);
      var minY = Math.min(self.startSel.y, self.endSel.y);
      var maxX = minX + Math.abs(self.startSel.x - self.endSel.x)
      var maxY = minY + Math.abs(self.startSel.y - self.endSel.y)

      var xpos = radius + minX * (size + self.options.cellGap);
      var ypos = radius + minY * (size + self.options.cellGap);
      var xsiz = Math.abs(self.startSel.x - self.endSel.x) * (size + self.options.cellGap);
      var ysiz = Math.abs(self.startSel.y - self.endSel.y) * (size + self.options.cellGap);
      self.ctx.fillStyle = 'rgba(64,128,255,0.6)';
      self.ctx.fillRect(xpos, ypos, xsiz, ysiz);

      for (x=minX; x<=maxX; x++) {
         for (y=minY; y<=maxY; y++) {
            if (self.Cell(x, y)){
               self.DrawCell(x,y);
            }
         }
      }
   };

   this.IsDead = function(){
      var i = self.step % 100;
      if (i < 87) return false;
      return self.StateCheck(i - 87);
   }

   this.StateCheck = function(index){
      self.states[index] = self.BuildState();
      if (index < 4) return false;
      if (self.states[0] == self.states[2] && self.states[2] == self.states[4 ]) return true;
      if (index < 6) return false;
      if (self.states[0] == self.states[3] && self.states[3] == self.states[6 ]) return true;
      if (index < 8) return false;
      if (self.states[0] == self.states[4] && self.states[4] == self.states[8 ]) return true;
      if (index < 12) return false;
      if (self.states[0] == self.states[6] && self.states[6] == self.states[12]) return true;
      return false;
   };

   this.BuildState = function(){
      var state = "";
      for (var x=0; x<self.options.xGrid; x++){
         for (var y=0; y<self.options.yGrid; y++){
            if (self.Cell(x,y)) {
               state += self.HashKey(x, y);
            }
         }
      }
      return state;
   };

   this.ResizeCellGrid = function(newX, newY){
      var newSize  = newX * newY;
      var newArray = new Int8Array(newSize);

      if (self.currentSet && self.currentSet.length){
         for (var y=0; y<Math.min(self.options.yGrid, newY); y++) {
            for (var x=0; x<Math.min(self.options.xGrid, newX); x++) {
               newArray[y*newX + x] = self.Cell(x, y);
            }
         }
      }
      self.currentSet = self.cellArray0 = newArray;
      self.workingSet = self.cellArray1 = new Int8Array(newSize);
      self.activeSet = 0;
   };

   this.ClearCellGrid = function(){
      self.currentSet.fill(0);
   };

   this._Cell = function(set, x, y, val){
      var i = y * self.options.xGrid + x;
      if (val != undefined) return set[i] = val;
      return set[i];
   };

   this.Cell = function(x, y, val){
      return self._Cell(self.currentSet, x, y, val);
   };

   this.WorkingCell = function(x,y,val){
      return self._Cell(self.workingSet, x, y, val);
   };

   this.NormalizedCell = function(x, y, val){
      x = (self.options.xGrid + x) % self.options.xGrid;
      y = (self.options.yGrid + y) % self.options.yGrid;
      return self._Cell(self.currentSet, x, y, val);
   };

   this.NormalizedWorkingCell = function(x,y,val){
      x = (self.options.xGrid + x) % self.options.xGrid;
      y = (self.options.yGrid + y) % self.options.yGrid;
      return self._Cell(self.workingSet, x, y, val);
   };


   // we have 2 arrays, The first is on the screen and is used to generate
   // the second. and then we swap. Rinse and repeat.
   //
   this.SwapCellSet = function(){
      self.activeSet = 1 - self.activeSet;
      self.currentSet = self.activeSet ? self.cellArray1 : self.cellArray0;
      self.workingSet = self.activeSet ? self.cellArray0 : self.cellArray1;
   };

   this.DebugInfo = function(){
      // bla...
   };

   this.FpsInfo = function(){
      self.fpsStep++;
      var t = (new Date()).getTime();
      if (t - self.fpsTime > 1000){
         self.fps = self.fpsStep;
         self.fpsTime = t;
         self.fpsStep = 0;
      }
      self.fpsInfo.text(self.fps);
   };

   this.sz = function(label,e){
      return label +"("+ e.width() +","+ e.height() +") ";
   }

///////////////////////////////////// generation start ////////////////////////////////////////

   this.GenerateRandom = function(){
      console.log("GenerateRandom");
      var box = self.Containment(0.2, 1.0);
      var pct = this.RandomRange(5, 35);
      for (var x=box.xmin; x<box.xmax; x++){
         for (var y=box.ymin; y<box.ymax; y++){
            if (Math.random()*100 < pct){
               self.Cell(x,y,1);
            }
         }
      }
   };

   this.GenerateXY = function(){
      console.log("GenerateXY");
      var box = self.Containment(0.2, 1.0);
      var halfx = Math.floor(self.options.xGrid/2);
      var halfy = Math.floor(self.options.yGrid/2);
      var xsize = Math.floor(self.options.xGrid);
      var ysize = Math.floor(self.options.yGrid);
      var pct = this.RandomRange(15, 40);
      for (var x=box.xmin; x<halfx; x++){
         for (var y=box.ymin; y<halfy; y++){
            if (Math.random()*100 > pct) continue;
            self.Cell(x      , y      , 1);
            self.Cell(x      , ysize-y, 1);
            self.Cell(xsize-x, y      , 1);
            self.Cell(xsize-x, ysize-y, 1);

         }
      }
   };

   this.GenerateXYWalk = function(){
      console.log("GenerateXYWalk");
      var cX = Math.floor(self.options.xGrid/2);
      var cY = Math.floor(self.options.yGrid/2);
      var dX = self.RandomRange(0, 2) ? 1 : 0;
      var dY = self.RandomRange(0, 2) ? 1 : 0;
      var sX = self.RandomRange(5, self.options.xGrid/3);
      var sY = self.RandomRange(5, self.options.yGrid/3);
      var d  = self.RandomRange(15, 40);
      var ww = self.RandomRange(0, 2) ? 2 : 1+self.options.xGrid/self.options.yGrid;
      var x = 0;
      var y = 0;
      self.cells = [];
      while (x < sX && y < sY){
         var dir = self.RandomRange(0, ww) ? 1 : 0;
         if (!dir) x++;
         if ( dir) y++;
         self.Cell(cX-x+dX, cY-y+dY, 1);
         self.Cell(cX-x+dX, cY+y   , 1);
         self.Cell(cX+x   , cY-y+dY, 1);
         self.Cell(cX+x   , cY+y   , 1);
      }
   };

   this.GenerateXMirror = function(){
      console.log("GenerateXMirror");
      var marginX = self.RandomRange(self.options.xGrid/8, self.options.xGrid/3);
      var sX      = marginX;
      var eX      = self.options.xGrid - marginX;
      var sizeY   = self.RandomRange(self.options.yGrid/8, self.options.yGrid/3);
      var cY      = Math.floor(self.options.yGrid/2);
      for (x = sX; x < eX; x++){
         for (y = 0; y < sizeY; y++){
            var weight = ((sizeY - y) / sizeY) * 0.8;
            var present = (Math.random() < weight ? true : false);
            if (present){
               self.Cell(x, cY-y, 1);
               self.Cell(x, cY+y, 1);
            }
         }
      }
   };

   this.Containment = function(min, max){
      var val   = min + Math.random() * (max - min);
      var halfx = Math.floor(self.options.xGrid/2);
      var halfy = Math.floor(self.options.yGrid/2);
      var xd    = Math.floor(halfx * val);
      var yd    = Math.floor(halfy * val);
      return {xmin: halfx - xd,
              xmax: halfx + xd,
              ymin: halfy - yd,
              ymax: halfy + yd};
   };

///////////////////////////////////// generation end ////////////////////////////////////////
///////////////////////////////////// editing start ////////////////////////////////////////

   this.KeyDown = function (event){
      var e = event.originalEvent;
      switch(e.which){
         case 27: return self.TogglePause();        // esc   - toggle pause
         case 32: return self.ToggleActiveCell();   // space - toggle cell
         case 16: return self.StartMark();          // shift - start selecting
         case 17: return self.StartMark();          // ctrl  - start selecting
         case 37: return self.MoveActiveCell(-1,0); // left  - move selected cell
         case 38: return self.MoveActiveCell(0,-1); // up    - move selected cell
         case 39: return self.MoveActiveCell(1,0);  // right - move selected cell
         case 40: return self.MoveActiveCell(0,1);  // down  - move selected cell
         case 65: return self.ToggleAutoReap();     // a     - toggle auto reap
         case 67: return self.Clear();              // c     - clear
         case 68: return self.DisableInterface();   // d     - disable interface
         case 70: return $("#fps").toggle();        // f
         case 72: return $("#help").toggle();       // h
         case 77: return self.ChangeDrawMethod();   // m     - cycle draw method
         case 78: return self.Reset();              // n     - new screen
         case 80: return self.Paste(self.activePos);// p     - pastepp`
         case 82: return self.Reap();               // r     - reap
         case 83: return self.SingleStep();         // s     - Single step
         case 85: return self.ShowRule();           // u     - Show/Set Rule
         case 107:return self.Rescale(e,1.1);       // +     - bigger cells  / faster
         case 109:return self.Rescale(e,0.9);       // -     - smaller cells / slower
         case 191:return $("#help").toggle();       // ?
      }
      if (e.which >= 48 && e.which <= 57 && e.shiftKey){
         self.StoreBuffer(e.which-48);
      }
      if (e.which >= 48 && e.which <= 57 && !e.shiftKey){
         self.LoadBuffer(e.which-48);
         self.Paste(self.activePos);
         self.DrawIfPaused();
      }
   };

   this.KeyUp = function(event){
      var e = event.originalEvent;
      switch(e.which){
         case 16: return self.EndMark();           // shift - stop selecting
         case 17: return self.EndMark();           // ctrl  - stop selecting
      }
   };

   this.MouseDown = function(event){
      var e = event.originalEvent;
      self.SetActiveFromMouse(e);
      var set = (e.buttons == 1 ? 1 : 0);
      self.SetActiveCell(set);
      self.DrawIfPaused();
   };

   this.MouseUp = function(event){
      var e = event.originalEvent;
      self.SetActiveFromMouse(e);
      self.DrawIfPaused();
   };

   this.MouseMove = function(event){
      var e = event.originalEvent;
      self.SetActiveFromMouse(e);

      if (e.buttons == 1){
         self.SetActiveCell(1);
      }
      if (e.buttons == 2){
         self.SetActiveCell(0);
      }
      self.DrawIfPaused();
   };

   this.TogglePause = function(){
      self.pauseMode = 1 - self.pauseMode;
      if (self.pauseMode) {
         clearInterval(self.interval);
      } else {
         self.interval = setInterval(self.Step, self.options.interval);
      }
   };

   this.SingleStep = function(){
      if (!self.pauseMode) {
         self.pauseMode = 1;
         clearInterval(self.interval);
      }
      self.Step();
   };

   this.ShowRule = function() {
      let rule = "B" + self.bRule.join("") + "/S" + self.sRule.join("");
      $("#set-rule").toggle();
      $("#rule").val(rule).focus();
      return false;
   };

   this.SetRule = function() {
      let rule = $("#rule").val().trim();
      let vals = rule.match(/B(\d+)\/S(\d+)/);
      if (vals[1] && vals[2]) {
         self.bRule = vals[1].split("");
         self.sRule = vals[2].split("");
      }
      $("#set-rule").hide();
   };

   this.ToggleActiveCell = function(){
      var pos = self.activePos;
      self.Cell(pos.x, pos.y, 1-self.Cell(pos.x, pos.y));
      self.DrawIfPaused();
   };

   this.StartMark = function(){
      if (!self.selecting){
         self.selecting = 1;
         self.startSel.x = self.endSel.x = self.activePos.x;
         self.startSel.y = self.endSel.y = self.activePos.y;
      }
      self.DrawIfPaused();
   };

   this.EndMark = function(){
      if (self.selecting){
         self.selecting = 0;
         self.endSel.x = self.activePos.x;
         self.endSel.y = self.activePos.y;
         self.CopySelection();
      }
      self.DrawIfPaused();
   };

   this.SetActiveFromMouse = function(e){
      var radius        = self.options.cellSize / 2;
      self.activePos.x = Math.floor((e.x-radius)/(self.options.cellSize + self.options.cellGap));
      self.activePos.y = Math.floor((e.y-radius)/(self.options.cellSize + self.options.cellGap));
      if (self.selecting == 1){
         self.endSel.x = self.activePos.x;
         self.endSel.y = self.activePos.y;
      }
   };

   this.MoveActiveCell = function(dx, dy){
      self.activePos.x = (self.options.xGrid + self.activePos.x + dx) % self.options.xGrid;
      self.activePos.y = (self.options.yGrid + self.activePos.y + dy) % self.options.yGrid;
      self.DrawIfPaused();
   };


   //0=clear, 1=set, 2=toggle
   this.SetActiveCell = function(set){
      var pos = self.activePos;
      if (set == 2) set = 1-self.Cell(pos.x, pos.y);
      self.Cell(pos.x, pos.y, set);
   };

   this.ChangeDrawMethod = function() {
      self.drawMethod = 1 - self.drawMethod;
   }

   this.Clear = function(){
      self.ClearCellGrid();
      self.DrawIfPaused();
   };

   this.Reset = function(){
      self.CreateCells();
      self.DrawIfPaused();
   };

   this.Rescale = function(e, scale){
      if (e.shiftKey){
         self.RescaleSpeed(scale);
      } else {
         self.RescaleSize(scale);
      }
   };

   this.RescaleSize = function(scale){
      var size = Math.floor(self.options.cellSize * scale);
      if (size == self.options.cellSize && scale > 1.0){
         size++;
      }
      if (size == self.options.cellSize && scale < 1.0){
         size = Math.max(2, size-1);
      }
      size = Math.max(1, size);
      self.options.cellSize = size;
      self.Resize();
      self.DrawIfPaused();
   };

   this.RescaleSpeed = function(scale){
      var interval = Math.floor(self.options.interval / scale);
      if (interval == self.options.cellSize && scale < 1.0){
         interval++;
      }
      if (interval == self.options.cellSize && scale > 1.0){
         interval = Math.min(2, interval-1);
      }
      self.options.interval = interval;
      self.TogglePause();
      self.TogglePause();
   };

   this.DisableInterface = function(){
      $("#help").hide();
      $(self.canvas).off("mousemove").off("mousedown").off("mouseup");
      $(window).off("keydown").off("keyup");
   };


   this.CopySelection = function(){
      var minX = Math.min(self.startSel.x, self.endSel.x);
      var minY = Math.min(self.startSel.y, self.endSel.y);
      var sizX = Math.abs(self.startSel.x - self.endSel.x) + 1;
      var sizY = Math.abs(self.startSel.y - self.endSel.y) + 1;
      self.sel = [{x:sizX,y:sizY}];
      for (x=0; x<sizX; x++) {
         for (y=0; y<sizY; y++) {
            if (self.Cell(x+minX, y+minY)) {
               self.sel.push({x:x,y:y});
            }
         }
      }
   };

   this.Paste = function(pos){
      var sizX = self.sel[0].x;
      var sizY = self.sel[0].y;

      for (dx=0; dx<sizX; dx++) {
         for (dy=0; dy<sizY; dy++) {
            self.Cell(pos.x+dx, pos.y+dy, 0);
         }
      }
      for (var i=1; i<self.sel.length; i++){
         self.Cell(pos.x+self.sel[i].x, pos.y+self.sel[i].y, 1);
      }
      self.DrawIfPaused();
   };


   this.ToggleAutoReap = function(){
      self.autoReap = 1 - self.autoReap;
   };

   this.AutoReap = function(){
      if (!self.autoReap) return;
      if (self.step % 10) return;

      self._Reap();
   };

   // remove some static structures from the arena
   //
   this.Reap = function(){
      self.ReapPrep();
      self._Reap();
      self.SwapCellSet();
      self.Draw();
   };

   this._Reap = function(){
      let shapes = [
         ["11","11"],
         ["111"],
         ["1","1","1"],
         ["010","101","010"],
         ["010","101","101","010"],
         ["0110","1001","0110"],
      ];

      for (var s=0; s<shapes.length; s++) {
         var shape = self.Shape(shapes[s]);
         for (var x=0; x<self.options.xGrid; x++) {
            for (var y=0; y<self.options.yGrid; y++) {
               if (self.See(x, y, 2, shape)) self.Eradicate(x, y, shape);
            }
         }
      }
   };

   this.ReapPrep = function(){
      for (var x=0; x<self.options.xGrid; x++){
         for (var y=0; y<self.options.yGrid; y++){
            self.WorkingCell(x,y,self.Cell(x,y));
         }
      }
   };

   this.Shape = function(data){
      return data.map(l => l.split(""));
   };

   this.See = function(xpos, ypos, buffer, shape){
      let xSize = shape[0].length;
      let ySize = shape.length;
      for (var x=-buffer; x<shape[0].length+buffer; x++){
         for (var y=-buffer; y<shape.length+buffer; y++){
            var live = self.NormalizedCell(xpos+x, ypos+y);
            if (x < 0 || y < 0 || x >= xSize || y >= ySize) {
               if (live) return false;
            } else if (shape[y] == undefined) {
               debugger;
            } else if (live != shape[y][x]) {
               return false;
            }
         }
      }
      return true;
   };

   this.Eradicate = function(xpos, ypos, shape){
      let xSize = shape[0].length;
      let ySize = shape.length;
      for (var x=0; x<xSize; x++){
         for (var y=0; y<ySize; y++){
            self.NormalizedWorkingCell(xpos+x, ypos+y, 0);
         }
      }
   };

   this.StoreBuffer = function(idx){
      localStorage.setItem("object"+idx, JSON.stringify(self.sel));
   };

   this.LoadBuffer = function(idx){
      self.sel = JSON.parse(localStorage.getItem("object"+idx));
   };

///////////////////////////////////// editing end ////////////////////////////////////////

   this.HSL = function(h, s, l){
      return 'hsl('+h+','+s+','+l+')';
   };

   this.HashKey = function(x, y){
      return "["+x+","+y+"]";
   }

   this.UrlParam = function(name, defaultVal){
      var results = new RegExp('[\\?&]' + name + '=([^&#]*)').exec(window.location.href);
      if(results){
         return decodeURIComponent(results[1]);
      }
      return defaultVal;
   };

   this.Random = function (max){
      return Math.floor(Math.random() * max);
   };

   this.RandomRange = function (min, max){
      return Math.floor(min + Math.random() * (max - min));
   };

   this.Init(canvas, options);
};
