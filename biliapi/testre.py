import requests

def get_live_room_info(room_id):
    url=f'https://api.live.bilibili.com/room/v1/room/{room_id}'
    response = requests.get(url)
    return response.json()
room_id=30015166
live_info=get_live_room_info(room_id)
print(live_info)