
#include <X11/Xlib.h>
#include <X11/Xatom.h>
#include <X11/Xutil.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <stdbool.h>

 
   Display *d;
   Window w;
   Window rw;

void WmState(Window w, bool set, Atom a1, Atom a2)
{
	XEvent e;
	memset(&e, 0, sizeof(e));
	e.xclient.type = ClientMessage;
	e.xclient.message_type = XInternAtom(d, "_NET_WM_STATE", false);
	e.xclient.display = d;
	e.xclient.window = w;
	e.xclient.format = 32;
	e.xclient.data.l[0] = set;
	e.xclient.data.l[1] = a1;
	e.xclient.data.l[2] = a2;
	XSendEvent(d, rw, false, SubstructureNotifyMask | SubstructureRedirectMask, &e);
}

int main(void) {
   XEvent e;
   const char *msg = "Hello, World!";
   int s;
    int root_x, root_y;
    int win_x, win_y;
    unsigned int mask_return;
    Bool result;
 
   d = XOpenDisplay(NULL);
   if (d == NULL) {
      fprintf(stderr, "Cannot open display\n");
      exit(1);
   }
 
   s = DefaultScreen(d);
   rw = RootWindow(d, s);
       XVisualInfo vinfo;

    int mvi = XMatchVisualInfo(d, s, 32, TrueColor, &vinfo);

    XSetWindowAttributes attr;
    attr.colormap = XCreateColormap(d, rw, vinfo.visual, AllocNone);
    attr.border_pixel = 0;
    attr.background_pixel = 0;

   w = XCreateWindow(d, rw, 0, 0, 300, 300, 0, vinfo.depth, InputOutput, vinfo.visual, CWColormap | CWBorderPixel | CWBackPixel, &attr);

   XSelectInput(d, w, ExposureMask);
   Atom window_type = XInternAtom(d, "_NET_WM_WINDOW_TYPE", False);
  long value = XInternAtom(d, "_NET_WM_WINDOW_TYPE_DOCK", False);
  XChangeProperty(d, w, window_type, XA_ATOM, 32, PropModeReplace, (unsigned char *) &value, 1);

	GC gr_context1;
      XGCValues gr_values; 

  gr_values.function =   GXcopy; 
      gr_values.plane_mask = AllPlanes; 
      gr_values.foreground = BlackPixel(d,s); 
      gr_values.background = WhitePixel(d,s); 
      gr_context1=XCreateGC(d,w, 
                  GCFunction | GCPlaneMask | GCForeground | GCBackground, 
                  &gr_values); 

  XMapWindow(d, w);

	const int X = 64;
	const int Y = 64;

	char *data = (char*)malloc(X*Y*4);

	FILE* f = fopen("img.bin", "rb");
	fread(data, 1, X*Y*4, f);
	fclose(f);

	XImage *img = XCreateImage(d,vinfo.visual,vinfo.depth,ZPixmap,0,data,X,Y,32,0);
	//int count = X*Y;
	/*for (int i = 0; i < count; ++i)
	{
		data[4 * i + 3] = 0x7f;
		data[4 * i + 1] = i % (1 + (unsigned char)data[4 * i + 3]);
		data[4 * i + 2] = i % (1 + (unsigned char)data[4 * i + 3]);
		data[4 * i + 0] = i % (1 + (unsigned char)data[4 * i + 3]);
	}*/

  //Window root_window = XRootWindow(d, 0);
    Window window_returned;
    int lastx = -1, lasty = -1;

   while (1) {
      while (!XCheckMaskEvent(d, ExposureMask | KeyPressMask, &e))
      {
	      usleep(50000);
        result = XQueryPointer(d, rw, &window_returned,
                &window_returned, &root_x, &root_y, &win_x, &win_y,
                &mask_return);
        if (result == True) {
		if (lastx != root_x || lasty != root_y)
		{
	            //printf("%d x %d\n", root_x, root_y);
		    XMoveWindow(d, w, root_x + 4, root_y + 4);
		    lastx = root_x;
		    lasty = root_y;
		}
        }
      }
      if (e.type == Expose) {
	 XPutImage(d,w,gr_context1,img,0,0,0,0,X,Y);
	 //XSetForeground(d, gr_context1, 0x80803020);
         //XFillRectangle(d, w, gr_context1, 0, 0, 10, 10);
         //XDrawString(d, w, DefaultGC(d, s), 10, 50, msg, strlen(msg));
	 //WmState(w, true, XInternAtom(d, "_NET_WM_STATE_ABOVE", False), 0);
      }
      if (e.type == KeyPress)
         break;
      //printf("ok\n");
   }
 
   XCloseDisplay(d);
   return 0;
}

