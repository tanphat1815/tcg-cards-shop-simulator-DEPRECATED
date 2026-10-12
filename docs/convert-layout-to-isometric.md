# **Báo cáo Tái cấu trúc Kiến trúc Trò chơi: Chuyển đổi sang Phối cảnh Isometric (Phaser 3 & Vue 3\)**

Báo cáo này phác thảo kế hoạch kỹ thuật toàn diện để chuyển đổi dự án "TCG Card Shop Simulator" từ góc nhìn 2.5D (Top-Down Oblique) hiện tại sang góc nhìn Isometric thực thụ. Việc chuyển đổi sang Isometric sẽ mang lại chiều sâu không gian chân thực nhất, nhưng đi kèm với sự thay đổi lớn về mặt toán học kết xuất và vật lý.

Mục tiêu của tài liệu này là cung cấp cho đội ngũ phát triển (hoặc AI Developer) một danh sách kiểm tra (checklist) và hướng dẫn cấu trúc để biết chính xác những module nào cần "đập đi xây lại", những module nào cần nâng cấp và những gì có thể được tái sử dụng.

## ---

**1\. Những Hệ Thống BẮT BUỘC Phải "Đập Bỏ" Và Làm Lại (Tear Down & Rebuild)**

### **1.1. Tài nguyên Đồ họa (Art Assets) và Hệ thống Bản đồ (Tilemap)**

Đây là thay đổi tốn kém nhất về mặt thời gian. Trong không gian Isometric, mọi thứ bị xoay ![][image1] và nghiêng để tạo ảo giác 3D.

* **Tilemap Editor (Tiled):** Không thể sử dụng lưới vuông (Orthogonal) nữa. Bản đồ phải được thiết lập lại thành định dạng Isometric trong Tiled. Phaser 3 đã hỗ trợ render trực tiếp bản đồ Isometric gốc từ phiên bản 3.50.0 trở lên.  
* **Kích thước Gạch (Tile Size):** Tỷ lệ chuẩn cho tile Isometric thường là 2:1 (ví dụ: chiều rộng 64px, chiều cao 32px). Toàn bộ ảnh sàn nhà, vách tường sẽ phải được xuất lại.  
* **Sprite Nhân vật:** Các sprite 4 hướng (Lên, Xuống, Trái, Phải) hiện tại sẽ bị loại bỏ. Thay vào đó, nhân vật và NPC phải được vẽ lại với 4 hoặc 8 hướng chéo (Tây Bắc northWest, Đông Bắc northEast, Tây Nam southWest, Đông Nam southEast).

### **1.2. Công thức Tọa độ (Coordinate Math)**

Khái niệm tọa độ ![][image2] và ![][image3] trên màn hình (Screen Space) và trong thế giới game (World Space) sẽ hoàn toàn khác biệt. Mã nguồn hiện tại đang map tỷ lệ 1:1 giữa tọa độ game và màn hình, điều này phải bị xóa bỏ.

* Mọi logic liên quan đến việc đặt vị trí (positioning) đồ vật thủ công phải được đi qua một hàm chuyển đổi.  
* **Công thức chuyển đổi cơ bản (Từ World sang Screen):**  
  Đoạn code định vị lưới vuông cũ phải được thay thế bằng công thức chiếu Isometric:  
  JavaScript  
  const tx \= (worldX \- worldY) \* tileWidthHalf;  
  const ty \= (worldX \+ worldY) \* tileHeightHalf;

  Tọa độ kết xuất trên màn hình của một vật thể sẽ là centerX \+ tx và centerY \+ ty.

## ---

**2\. Những Hệ Thống Cần ĐIỀU CHỈNH Logic Cốt Lõi (Core Logic Adjustments)**

### **2.1. Thuật toán Sắp xếp Chiều sâu (Depth Sorting / Z-Index)**

Thuật toán child.setDepth(child.y) mà dự án đang dùng hiện tại sẽ thất bại hoàn toàn trong môi trường Isometric. Chiều sâu trong Isometric phụ thuộc vào cả 3 trục ![][image2], ![][image3], và ![][image4] trong không gian ảo.

* **Cập nhật vòng lặp update():** Logic sắp xếp độ sâu phải được tính toán lại dựa trên tổng của tọa độ lưới. Một thực thể ở xa nhất sẽ có tọa độ lưới ![][image5] thấp nhất. Công thức sắp xếp độ sâu mới sẽ có dạng: depth \= worldX \+ worldY \+ worldZ.1  
* Trong trường hợp sử dụng Tilemap của Phaser, độ sâu của mỗi tile hoặc vật thể có thể được thiết lập bằng công thức depth \= centerY \+ ty (với ty là tọa độ màn hình đã được chiếu isometric).

### **2.2. Hệ thống Vật lý và Va chạm (Physics Engine)**

* **Hạn chế của Arcade Physics:** Phaser's Arcade Physics chỉ hỗ trợ các hộp va chạm hình chữ nhật thẳng đứng (AABB \- Axis-Aligned Bounding Box). Việc áp một hộp va chạm hình chữ nhật lên một viên gạch hình thoi (diamond) trong Isometric sẽ tạo ra các góc chết, khiến người chơi bị kẹt vào những khoảng không vô hình.  
* **Giải pháp nâng cấp:**  
  1. *Cách 1 (Khuyên dùng):* Chuyển đổi engine vật lý từ Arcade sang Matter.js. Matter.js được tích hợp sẵn trong Phaser 3 và hỗ trợ các hình khối va chạm đa giác phức tạp (Convex Hulls), cho phép định nghĩa các vùng va chạm hình thoi chính xác.  
  2. *Cách 2:* Từ bỏ hệ thống va chạm vật lý của Phaser, tự viết một mảng 2D logical grid chạy ngầm. Khi người chơi ấn di chuyển, game kiểm tra mảng 2D này xem ô tiếp theo có bị chặn không, nếu không thì dùng Tween để trượt nhân vật sang ô đó.

### **2.3. Vector Điều khiển (Movement Input)**

Cơ chế bấm phím W, A, S, D phải được map lại. Trong Isometric, bấm "Lên" (W) không làm nhân vật đi thẳng lên màn hình, mà nhân vật sẽ di chuyển theo trục Đông Bắc (northEast) hoặc Tây Bắc (northWest) trong không gian thế giới game. Tốc độ trục ![][image3] trên màn hình cũng phải giảm đi một nửa so với trục ![][image2] để khớp với tỷ lệ 2:1 của lưới.

## ---

**3\. Những Hệ Thống Được BẢO TOÀN TỐI ĐA (What Can Be Kept)**

Đập đi xây lại không có nghĩa là vứt bỏ tất cả. Bạn có thể giữ nguyên vẹn toàn bộ lớp dữ liệu và kiến trúc bậc cao sau:

1. **Cầu nối Vue 3 & Pinia:** Toàn bộ giao diện người dùng (Cửa hàng, Kho đồ, Bảng điều khiển) xây bằng Vue và Tailwind CSS, cũng như toàn bộ dữ liệu quản lý bằng Pinia Store được giữ nguyên vẹn 100%. Game thế giới (Phaser) chỉ là một công cụ kết xuất hình ảnh.  
2. **Hệ thống Giao tiếp (Event Bus):** Luồng phát sự kiện giữa Phaser và Vue 3 không bị ảnh hưởng bởi góc nhìn camera.  
3. **Quản lý Cảnh (Scene Manager):** Kiến trúc chuyển cảnh (từ Shop ra Town hoặc Gym) cùng với các hiệu ứng làm mờ (Camera Fade) vẫn hoạt động hoàn hảo.  
4. **Cấu trúc Máy Trạng Thái (FSM):** Logic ra quyết định của AI, Nhân viên và Khách hàng (FSM) không thay đổi. Chúng ta chỉ cần thay đổi "hành động" đầu ra trong các state di chuyển (thay đổi vector vận tốc và tên hoạt ảnh).

## ---

**4\. Lộ Trình Thực Hiện Dành Cho AI (Action Plan)**

Khi cung cấp tài liệu này cho AI hỗ trợ lập trình, hãy yêu cầu AI thực hiện theo các bước tuần tự sau để tránh phá vỡ dự án:

* **Bước 1: Nền tảng Đồ họa & Tiled:**  
  Tạo một bộ tileset mockup hình thoi. Khởi tạo một scene test, config Phaser đọc file Tilemap Isometric JSON và hiển thị thành công bản đồ lưới 2:1 lên màn hình. Đảm bảo cấu hình physics: { default: 'matter' } (nếu quyết định dùng Matter.js).  
* **Bước 2: Hệ thống Tọa độ & Sắp xếp Chiều sâu:** Viết các hàm Utils chuyển đổi WorldToScreen và ScreenToWorld. Khởi tạo một sprite nhân vật đơn giản và áp dụng thuật toán phân loại trục Y (Z-Index) dựa trên tổng tọa độ Isometric.1 Đảm bảo nhân vật có thể đi vòng ra trước và sau một chướng ngại vật hình thoi.  
* **Bước 3: Tái cấu trúc Vật lý & Di chuyển:**  
  Xóa Arcade Physics khỏi Player class. Thêm Matter.js body hoặc Grid-based movement. Cập nhật logic nhận phím WASD để dịch chuyển nhân vật theo các đường chéo 2:1.  
* **Bước 4: Cập nhật FSM cho NPC:**  
  Chỉnh sửa hệ thống tìm đường (Pathfinding) để nó trả về các lộ trình trên lưới Isometric thay vì lưới vuông. Kết nối lại các hoạt ảnh 4/8 hướng chéo mới.  
* **Bước 5: Đồng bộ hóa dữ liệu (Pinia):**  
  Kết nối lại các sự kiện EventBus từ Vue 3 vào thế giới Isometric mới đã hoàn thiện.

#### **Works cited**

1. Have any of you found a good way to handle drawing order in Isometric games? \- Reddit, accessed April 23, 2026, [https://www.reddit.com/r/gamedev/comments/pj3bpr/have\_any\_of\_you\_found\_a\_good\_way\_to\_handle/](https://www.reddit.com/r/gamedev/comments/pj3bpr/have_any_of_you_found_a_good_way_to_handle/)

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABsAAAAXCAYAAAD6FjQuAAABcklEQVR4Xu2UTytFURTFl1BECUWKuklCZGCsjPxJIn/CTKQUAzMzBkY+AwYGSknyGcyVD2BgpEyUGMiAtZx9vX3vey8PMbqrfnX3Pqezz95n7wtkyvQDlZFNsuZ8tWb3Gi2klcyRYdtTTdbJrrFD6mytqAbJC9lyPh1+S95SnCB34CTpsG+pkSw5OyHdVFyQZ+QHOycLxgRpduvSGKl3dgWZd/anKsmeMY6QRTrYEUI5RSH1kRVSZcyQ0cQO0zRZNuKSpYMdk0VD5TskPW6PpNIpQ9GWWvtQhJCRshOFgimbMzJiqIm6yA1CBiUrwj8Fi98qcr5CwXR4jbNjn0p7jVC+L6UH3SezjlXygHCQaq/50QWGkMs+lprmkfQ7X1F1IxlIKKNXJIMdIMyVust3mILdkXbn+5YGkD9nGwh/hHJDUumuEC6imSpZeg+1s7hHyOKJXJImhL+EWn3b0GBr+E9JA/5AaohOYwqhqeTLlOn3egdppUU/WxhnsgAAAABJRU5ErkJggg==>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABIAAAAXCAYAAAAGAx/kAAAA30lEQVR4XmNgGDHAD4pnoWEDIOYA4lIscp5gnWiAB4pVgfg0EH8EYjsgZgViRiA2BuIHUNwIVQeyAC/IAeL/QBwB5YMMmwDEQVBMNKCaQYpA/ASIdwAxPxBXMZBoAAywAPFyIP4JxJsZIAENCieygAcQ/wPipQwUGAICwUD8F4ivA7E4mhzRwAyIZwJxDQNqoJMENIF4NgMkkJEDnRNZET4gD8VroDQIIAe6JVQMLwClUlDsgDCIjQxggT6FARLoWAM+A4hfMUDCAYZXAzEXVB6Udr4gyT2D4mSo/CgYBQCxgjDskX3fPwAAAABJRU5ErkJggg==>

[image3]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAXCAYAAAAC9s/ZAAAA1ElEQVR4Xu3RsQpBURwG8L9QlFBGg+IBDMoku8FiUh6AwUAGsyysFuUFvILd7gFMBrErgyS+f+cbjtt1O7LdfPUb7v3OPd3/OSKhSB1WPhrWmizMPP0U0lqmoARbuJF+nNCSiUIT9tSCHESsNdKFJ/XtAsnAEgrkm583KMKZNpDk+zjMocrnj4nBmq5QETPjQMzMTmmTjjGBIYzEc1hBydMBHmLm1hGco3MrPYOdmKv6KvYfLN4rt9ToDh1P55QxXaDs6QLTg6OYg1N6Cycx9/9P+PMCUjEs5BuzEc8AAAAASUVORK5CYII=>

[image4]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA8AAAAYCAYAAAAlBadpAAAA2UlEQVR4Xu3SMQ4BURQF0BF0EhES0VCJBUisgVqh0WosQK9QSCR6i7AChS1oJRqFUkWj4d7MfZPHyESoiJuczORNft7/834Q/ESKMoVFgo4t8PlocVtOMIY6VKAKS9lCzRb4zKTnaikYwVFa7luUAswl5+pdOOtJT5OHhljYhd3YmTugl8Jz8Xz8QdmHb4nhLlbC95fCDsRu/q9yu0MpqRbL24ttJDYWP5IyTCTj6lFsJDYWnz4MJBY/EhsLkw7Cq7iDptyFd3kDVzjIXi6qr4Pw4vjL88/35Aa9TDM37nLQBwAAAABJRU5ErkJggg==>

[image5]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEEAAAAXCAYAAABUICKvAAACmUlEQVR4Xu2XS6hNURjHP6G8KYNLlLwGJh4pIRkzYMCEDA0YGJCQR7qScmeS8pzKgIlMDIwYKmWkmNwkyoCIgeTx/1nrY9199z57n7NXuoP9q1+ns9dZr2+v9a11zDo6OirYKW+UuFZOk8dKyrb/qVnPViuvm9afJy8m5eflnKS8KVVjTb0mV3uFlFlyZfSp/GRh8FPlJLlejspzUX5Hh02g7eXyifxmYfLUTetPljvkS7lLzrfQb78sk2/lfblZLozykpH+CQTz6skh+Uvuid+pcMnC4NpwwEK7tF9krrwqlxQL+oQx86bTSdImwcVHFvqqpQuCWCrfyIcWKpyy9gEAluo7C+1OjwIDHpEb4vdBYfvQDlvVWSAf278gNA7yFHnHwv55YCHRDLI/i3i7Xy3kGKTdw5YnyLRPwuMTeIG8eZ984wA42+RPedvyBMBhubIlPMEekUctbx/A6iIBfrQWK2y3/CFfyKFCWRsWWThlaBvJA7WZuk84aU7K7xbmMRBE7ro8Y2MTZA7IA+SEZ1GOwpywoo7b+AD4dmBr92RV9KaF/ZQmSE9ibfGVcDmaGyZOAAhEusX2RrkrVEKU7kU9gaQJclN81pYtFga5L5oTVjA5oHgZYrX53HixpXCkcAr4jTHFE+QVq05eGy1kfO4SVb9xTsjPck20Dl/GoxbGWLYimbwH4JaN/Q0BILl7EPzk+MtB+d7Cvse70RmxnGPrS1LOdXR/NGWd/GDhOOKKXAZ9sbVIht4Wcq73YnGUBP3KwhU4hUk+j9Iu83kdZUw+dvJaztxWykw5bNVByMFZGx+ECUUXBAu55HTxYUZY9hes+T/X/w6ZeFiuKDzPAYkW+dPFyTJh4YY2u/gwEx4E2q87eTo6BuQ3dIqUb2xndQEAAAAASUVORK5CYII=>



Context About Thread Reddit 

r/gamedev
•
5 năm trước
gottlikeKarthos

Have any of you found a good way to handle drawing order in Isometric games?
Im making a 2.5D Isometric TileMap baded game in plain Java, and I found drawing order to be a major pain. Units clipping through buildings and such. It's especially bad with buildings that are larger than one tile.

Approaches I've tried:

Drawing everything thats on tile 1, then tile 2, etc from the top left to bottom right. This works when buildings are 1 tile in size, but bigger buildings will be clipping with those behind. And units Walking on top of castle walls also are a headache here.

2nd approach: Sort every building and unit by their Y value. This works well for troops of units but is computationally expensive and doesnt solve the big building issues.

I've looked arround online but there doesnt seem to be a best solution for handling Isometric drawing. Has anybody here found a good solution for this?

Phần bình luận
DonArtur
•
5 năm trước
I do something similar to your second approach, I sort based on the lowest vertical pixel of every object. Here is how:Give every building and unit a sortingOrder property. We want entities with higher sortingOrder values drawn in-front of those with lower values.

Then on every frame update each object's sorting order as follows:

entity.sortingOrder = (int)(sortingOrderBase - (object.position.y - object.size.y / 2) * 100);

where sortingOrderBase is an arbitrary large number (say 5000), object.position.y is the global position of the center of the object in the Y coordinate and object.size.y is the vertical size of the object.

Sort by sortingOrder and redraw.

EDIT:Some notes and optimizations are:

Do not recompute the sortingOrder for those objects that will never move, you can get away with only computing them once.

If you are concerned with the nlog(n) complexity of the sort, you can implement radix sort and make it linear as far as your values are in the range from 1 to n^2 (this is the case). More info here: https://www.geeksforgeeks.org/radix-sort/

Finally, I have a question for you. Why did you pick Java to develop your game? I thing you could benefit greatly from using Unity where a lot of this is automatic.

Good luck!


4
Avatar của gottlikeKarthos
gottlikeKarthos
OP
•
5 năm trước
Thanks for the reply! I explained why I'm using Java in the comment below, but seeing all these great unity features I kind of wish my Project was in that. But I learned a lot of Java at least. But since the game is already 20k lines long Im not going to move platform now.

I really need to use a more efficient sorting algorithm I suppose, because currently every building/unit is part of a superclass that stores their x and y value and their place in their own array. Then i use arrays.sort based only on their y value.

I'm not sure I understand the need to use the SortingOrderBase 5000. I use the very bottom raw y value of every object instead of the middle, maybe i should experiment with that.

I think one solution may be splitting 3x3 buildings into 9 1x1 sprites and draw them individually. Because when a unit walks by the bottom of it it works well, but once a unit reaches the middle of the building the unit y value is further up than the buildings and it starts disappearing behind it. I saw some quite complex looking solutions others have tried which used some lines for every building with which this stuff is calculated but im not sure thats a realistic approach for me.

If you are interested I can send you a link to a short Beta Gameplay Video on YouTube I did a while ago :) (tomorrow because I'm not home today)


3
DonArtur
•
5 năm trước
That would be great!

I base my response on what I did for another project in Unity. The SortingOrderBase is meant to compensate for objects being too far away from the Y axis origin, so an object does not end with a negative sortingOrder (which would be illegal in Unity).

I'm glad you are making progress with your game, as far as you are making progress and having fun is up to you to pick the tech stack. Good luck!

1

1 tin nhắn trả lời khác
Avatar của therealmitac
therealmitac
•
5 năm trước
You could use LibGDX which is in Java and use isometric camera there. Probably you will need to change your rendering code, but you'll keep the rest as is.

1
[đã xóa]
•
5 năm trước
It's been a while since I made something isometric, but I believe you generally want to draw your multi-tile buildings on a per tile basis. That's the only way you can have a character walking through a doorway where the char is drawn above the further edge of the door yet is occluded by the nesr edge.

Most of my knowledge of how to draw isometric stuff came from an old mmorpg called tibia. Check that one out and see if the style works for what you're making. If so, I can show you exactly how they made buildings and mobs so that they always (or almost always) draw correctly. The way the buildings were made was incredibly innovative when I learned about it like 20 years ago lol. I'm sure a lot of it is common knowledge now, but that's just my experience.

1
thorhunter1
•
5 năm trước
This is a common problem when trying to build isometric game without 3D engine. Depending on your choice of drawing you will either face render issues with between tile transitions or on z-axis. I struggled with those kinds of problems for a very long time and there was never a good solution. Only after I turned to OpenGL it provided me with tools that allowed me to solve any rendering problem (e.g. by using alpha and depth masks that operate on individual pixels rather than sprites). It has quite steep learning curve but once you get a decent grasp of it, any rendering issue (including performance) becomes so much easier to solve.


4
Avatar của Opus_723
Opus_723
•
5 năm trước
(e.g. by using alpha and depth masks that operate on individual pixels rather than sprites).

Any chance I could get you to elaborate on this? I'm very interested. Do individual pixels in your sprites have different depth values?


1
thorhunter1
•
5 năm trước
Hope this helps: https://imgur.com/a/p8mShHf

1
idbrii
•
5 năm trước
I googled for isometric sorting problem and found this explanation that uses line segments instead of your second solution.

I swear I once saw an article about this, but don't see it anymore.

This answer might help too.


3
Avatar của stack_bot
stack_bot
•
5 năm trước
The question "How do I sort isometric sprites into the correct order?" doesn't have an accepted answer. The answer by munificent is the one with the highest score of 13:

Isometric games are functionally 3D, so internally, you should be storing the 3D coordinates for each entity in the game. The actual coordinates you pick are arbitrary, but let's say X and Y are the two on-the-ground axes, and Z is off the ground up into the air.

The renderer then needs to project that into 2D to draw stuff on screen. "Isometric" is one such projection. Projecting from 3D to 2D isometrically is pretty simple. Let's say that the X axis goes from top-left to bottom-right and down one pixel for each two horizontal pixels. Likewise, the Y axis goes from top-right to bottom-left. The Z axis goes straight up. To convert from 3D to 2D then is just:

function projectIso(x, y, z) {
     return {
          x: x - y,
          y: (x / 2) + (y / 2) - z
     };
}
Now to your original question, sorting. Now that we're working with our objects directly in 3D, sorting becomes much simpler. In our coordinate space here, the farthest sprite has the lowest x, y and z coordinates (i.e. all three axes point out from the screen). So you just sort them by the sum of those:

function nearness(obj) {
     return obj.x + obj.y + obj.z;
}

function closer(a, b) {
     if (nearness(a) &gt; nearness(b)) {
          return &quot;a&quot;;
     } else {
          return &quot;b&quot;;
     }
}
To avoid re-sorting your entities every frame, use a pigeonhole sort, detailed here.

This action was performed automagically. info_post Did I make a mistake? contact or reply: error


Avatar của sdavid1726
sdavid1726
•
5 năm trước
I've been working on a custom isometric sprite tiling engine, and this is a pretty tricky problem depending on how many limitations you want to impose to make the drawing logic simpler. The "easiest" option is to break down all of your sprites into small pieces such that each sprite occupies a 1x1x1 volume in the game's 3D space. You can use the object's position in 3D space to calculate the "distance" of the object from the camera, and then draw all of your objects from back (furthest from camera) to front (closest to camera).

In my engine (C++ and SDL2), I expanded on this logic quite a bit to allow for structures with true interiors, windows, doors, and transparency when moving behind a large structure. Here's a quick demo video: https://www.youtube.com/watch?v=8VPYXn55jpk

The buildings in my engine are defined as nested "volume trees" such that the "back surfaces" of a volume (back walls, floor) are drawn first, followed by interior volume trees and objects, followed by "front surfaces" (ceiling, front walls). The draw order can be determined with a simple sorting scheme, which is fairly efficient as long as you don't have a thousand structures visible at once. This logic is pretty overkill though, and I would recommend sticking with simple 1x1x1 blocks (Minecraft style) as it makes drawing and asset creation a lot easier.


2
Avatar của gottlikeKarthos
gottlikeKarthos
OP
•
5 năm trước
That engine looks impressive with the jumping and whatnot








Kế hoạch Chuyển đổi Sang Isometric (Phaser 3)

Tổng quan kiến trúc mới

┌─────────────────────────────────────────────────────────────┐
│                    VUE 3 + PINIA (Giữ nguyên 100%)          │
│  GameContainer.vue │ UIOverlay.vue │ 15+ Pinia Stores        │
│  EventBus: Phaser ↔ Vue (Typed singleton)                   │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│            PHASER 3 - ISOMETRIC ENGINE (Tái cấu trúc)        │
│                                                              │
│  1. Tilemap System (Tiled JSON - Isometric Grid)             │
│  2. IsometricUtils (World↔Screen conversion)                │
│  3. Depth Sorting: depth = worldX + worldY + worldZ         │
│  4. Matter.js Physics (thay Arcade)                          │
│  5. Player/NPC Movement (4/8 hướng chéo)                   │
│  6. FSM cập nhật (pathfinding isometric)                   │
└─────────────────────────────────────────────────────────────┘

Các bước thực hiện

Bước 1: Nền tảng Đồ họa Isometric

Tạo tileset isometric mới:





Tạo thư mục src/assets/isometric/ chứa tileset hình thoi (tile size 64x32, tỷ lệ 2:1)



Cập nhật Tiled export format sang Isometric



Tạo scene test IsometricTestScene.ts để verify tilemap

File mới: src/game/isometric/IsometricTestScene.ts

Cập nhật: src/game/config/AppConfig.ts - thêm isometric config (tileWidth, tileHeight, GRID_TILE isometric)

Bước 2: Hệ thống Tọa độ & Depth Sorting

Tạo utility isometric chuyển đổi tọa độ:

File mới: src/features/environment/utils/IsometricUtils.ts

// Core isometric projection formulas
const tx = (worldX - worldY) * tileWidthHalf;
const ty = (worldX + worldY) * tileHeightHalf;
const screenX = centerX + tx;
const screenY = centerY + ty;

// Depth sorting: depth = worldX + worldY + worldZ
const depth = worldX + worldY + worldZ;

Tái cấu trúc: src/features/environment/ySortUtils.ts → thay thế bằng IsometricDepthManager

Cập nhật: src/features/environment/config/index.ts - cập nhật DEPTH constants cho isometric

Bước 3: Chuyển đổi Physics (Arcade → Matter.js)

Cập nhật game config:

// src/features/shop-ui/components/GameContainer.vue
physics: {
  default: 'matter',
  matter: {
    gravity: { y: 0 },
    debug: false
  }
}

Cập nhật collision bodies:





src/features/environment/managers/EnvironmentManager.ts - chuyển walls sang Matter bodies (hình thoi/diamond)



src/features/furniture/managers/FurnitureManager.ts - chuyển shelves/tables sang convex hulls



src/game/MainScene.ts - cập nhật applyFootCollider() → Matter body config

Tùy chọn grid-based fallback (nếu Matter.js gặp vấn đề):





Giữ AStarGridManager.ts làm logical collision layer



Movement dùng Tween thay vì physics velocity

Bước 4: Tái cấu trúc Movement & Input

Cập nhật PlayerFSM:

File: src/game/PlayerFSM.ts





WASD mapping mới cho isometric (W → northWest/northEast, S → southWest/southEast)



Tốc độ trục Y giảm 50% để khớp tỷ lệ 2:1



Thêm 8-directional animation support

Cập nhật NPCLocomotion:

File: src/features/customer/managers/NPCLocomotion.ts





Pathfinding trả về lộ trình isometric grid thay vì grid vuông



Smooth tween giữa các isometric tiles

Bước 5: Cập nhật NPC FSM & Animations

Cập nhật sprites NPC:





Thay thế sprite 4 hướng → 8 hướng chéo



Đăng ký animations isometric mới trong src/game/utils/characterAnimations.ts

Cập nhật pathfinding:





AStarGridManager.ts - điều chỉnh cho isometric grid coordinates



NPCManager.ts - kết nối lại movement với isometric coordinates

Bước 6: Đồng bộ Pinia & EventBus

Giữ nguyên:





Toàn bộ Vue components



Tất cả Pinia stores (gameStore facade, inventoryStore, furnitureStore, customerStore, etc.)



EventBus singleton và typed events



Scene Manager (MainScene ↔ TownScene transition)

Kiểm tra: Đảm bảo MainScene.ts và TownScene.ts phát/subsribe đúng events sau khi refactor

Cấu trúc thư mục mới

src/game/
├── MainScene.ts              # Giữ nguyên skeleton, refactor internals
├── TownScene.ts              # Giữ nguyên skeleton, refactor internals
├── PlayerFSM.ts              # Refactor: isometric movement
├── isometric/
│   ├── IsometricTestScene.ts       # NEW: Scene test tilemap
│   ├── IsometricUtils.ts           # NEW: World↔Screen conversion
│   └── IsometricDepthManager.ts    # NEW: Depth sorting logic
├── config/
│   └── AppConfig.ts                # Cập nhật: isometric tile sizes
└── utils/
    └── characterAnimations.ts       # Cập nhật: 8-directional animations

src/features/environment/
├── ySortUtils.ts            # → deprecated, thay bằng IsometricDepthManager
├── managers/
│   ├── EnvironmentManager.ts    # Refactor: Matter bodies
│   └── AStarGridManager.ts      # Cập nhật: isometric grid logic
└── config/
    └── index.ts               # Cập nhật: DEPTH constants

src/features/customer/
├── managers/
│   ├── NPCLocomotion.ts      # Refactor: isometric tweening
│   └── NPCManager.ts         # Cập nhật: isometric spawning
│   └── CustomerFSM.ts       # Giữ nguyên core FSM logic

src/features/shop-ui/
├── components/
│   └── GameContainer.vue    # Cập nhật: physics: 'matter'
│   └── UIOverlay.vue        # Giữ nguyên

Files chỉnh sửa chính





**src/features/shop-ui/components/GameContainer.vue** - Thêm Matter.js physics config



**src/game/config/AppConfig.ts** - Thêm isometric tile dimensions



**src/game/PlayerFSM.ts** - Isometric WASD mapping, 8-directional support



**src/features/environment/utils/IsometricUtils.ts** - NEW: Coordinate conversion



**src/features/environment/utils/IsometricDepthManager.ts** - NEW: Depth sorting



**src/features/environment/managers/EnvironmentManager.ts** - Matter bodies thay Arcade



**src/features/customer/managers/NPCLocomotion.ts** - Isometric pathfinding/tween



**src/game/MainScene.ts** - Cập nhật physics bodies, depth sorting



**src/features/shop-ui/components/GameContainer.vue** - Matter.js physics enable



**src/features/shop-ui/store/gameStore.ts** - Kiểm tra giữ nguyên integration

Files bị loại bỏ





**src/features/environment/ySortUtils.ts** - Thay bằng IsometricDepthManager



Sprite assets 4 hướng cũ → cần vẽ lại thành 8 hướng

Testing checklist





Tilemap isometric hiển thị đúng tỷ lệ 2:1



Player di chuyển đúng 8 hướng chéo isometric



Depth sorting hoạt động: player có thể đi vòng quanh object lớn hơn 1 tile



Collision body hình thoi không tạo góc chết



NPC pathfinding hoạt động trên isometric grid



Vue-Phaser EventBus vẫn hoạt động sau refactor



Scene transition (MainScene ↔ TownScene) vẫn hoạt động








Tổng kết Implementation
Files mới tạo (5 files)
src/features/environment/utils/IsometricUtils.ts — Core isometric math:

worldToScreen() / screenToWorld() — projection formulas
computeIsoDepth() — depth formula depth = worldX + worldY + worldZ
screenVelToWorld() — velocity compensation cho 2:1 ratio
gridToWorld() / worldToGrid() — grid helpers
setupIsometricSprite() — sprite config
src/features/environment/utils/IsometricDepthManager.ts — Depth sorting engine:

applyDynamicIsoDepth() — depth cho entity động
applyStaticIsoDepth() — depth cho entity tĩnh
IsometricDepthManager class — batch-optimized sorting
src/features/environment/physics/PhysicsAdapter.ts — Unified physics interface:

createPhysicsAdapter(scene, { mode: 'arcade' | 'matter' })
Support cả Arcade và Matter.js
Hỗ trợ body shapes: rectangle, circle, diamond, polygon, trapezoid
src/game/isometric/IsometricTestScene.ts — Test scene standalone:

Vẽ isometric grid 10x10 với tiles 64x32 (2:1)
Obstacle test cho multi-tile depth sorting
Keyboard movement với collision detection
src/game/isometric/ — Thư mục mới chứa isometric test scene

Files chỉnh sửa (10 files)
src/game/config/AppConfig.ts — Thêm ISOMETRIC config block (tile size, grid, depth base, offsets)

src/features/shop-ui/components/GameContainer.vue — Physics engine toggle:

ISOMETRIC.ENABLED = false → Arcade physics
ISOMETRIC.ENABLED = true → Matter.js physics
src/features/environment/config/index.ts — Thêm ISO_DEPTH_BASE và tài liệu cho cả 2 chế độ

src/game/PlayerFSM.ts — Complete rewrite:

WASD mapping cho isometric (4 keys → 8 hướng chéo)
Screen velocity compensation với ISO_MOVE_Y_SCALE = 0.5
IsoFacing type: SE, S, SW, W, NW, N, NE, E
updateDepth() method cho isometric mode
src/game/utils/characterAnimations.ts — 8-direction animations:

ISO_DIRECTIONS[] array (SE→E, 8 entries)
velocityToIsoFacing() — convert velocity angle → 8 hướng compass
src/features/customer/managers/NPCLocomotion.ts — Isometric movement:

8-direction animation support cho NPC
Depth sorting trong tween onUpdate
src/features/customer/managers/NPCManager.ts — Isometric-ready spawn:

Foot collider chỉ apply khi oblique mode
src/features/customer/managers/CustomerFSM.ts — Isometric depth sorting:

update() tính depth mỗi frame khi ISOMETRIC.ENABLED
src/features/staff/managers/StaffManager.ts — Isometric depth sorting:

update() branch giữa isometric formula và oblique Y-sort
src/game/MainScene.ts — Integration:

Player spawn với isometric depth initialization
Update loop branch cho isometric vs oblique depth sorting
Physics body setup tùy mode
Cách bật/tắt Isometric
// src/game/config/AppConfig.ts
ISOMETRIC: {
  ENABLED: false,  // true = bật isometric, false = oblique 2.5D (default)
  TILE_WIDTH: 64,
  TILE_HEIGHT: 32,
  GRID_CELL: 16,
  MOVE_Y_SCALE: 0.5,
  DEPTH_BASE: 100,
}
Khi ENABLED = true, tất cả các hệ thống tự động chuyển sang chế độ isometric. Vue/Pinia stores và EventBus giữ nguyên hoàn toàn.