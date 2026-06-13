
#!/usr/bin/python3
# -*- coding: UTF-8 -*-  



#****************************************************说明：*********************************************************
# 1：如果你的上位机未安装CAN库，则先安装CAN库：pip install python-can

# 2：如果你需要使用TTL串口或485总线串口  需要设置串口读写权限 权限设置命令 sudo chmod 777 /dev/ttyUSB0

# 3：如果你需要使用CAN总线接口请按照第1步安装 CAN 库 安装好后 执行下面命令 打开 CAN 通道 会看到对应板子上 两个红色LED灯发光说明 CAN通道已经打开

'''
#  以下是打开 每路 CAN 总线接口的命令，用哪路 就 执行对于命令，执行后 板子上对应CAN通道的两个LED会长亮说明 总线打开成功

sudo ip link set down can0
sudo ip link set can0 type can bitrate 1000000 loopback off
sudo ip link set up can0


sudo ip link set down can1
sudo ip link set can1 type can bitrate 1000000 loopback off
sudo ip link set up can1


sudo ip link set down can2
sudo ip link set can2 type can bitrate 1000000 loopback off
sudo ip link set up can2


sudo ip link set down can3
sudo ip link set can3 type can bitrate 1000000 loopback off
sudo ip link set up can3


'''

# 3：以下是 以控制小米电机为例的demo 代码



import can  
import time
import struct

hostID = 0xfd             #主机ID fd
pai = 3.1415926



# 不可改动
P_MIN = -12.5     #扭矩下限范围
P_MAX = 12.5      #扭矩上限范围
T_MIN = -12.0     #角度(弧度)下限范围
T_MAX = 12.0      #角度(弧度)上限范围
V_MIN = -30.0     #速度下限范围
V_MAX = 30.0      #速度上限范围
KP_MIN = 0.0      #KP下限范围
KP_MAX = 500.0    #KP上限范围
KD_MIN = 0.0      #KD下限范围
KD_MAX = 5.0      #KD上限范围





#=========================发送扩展CAN帧(主路线)=====================
# 在一般需要阻塞读取回复或慢速逐个(非多线程并发)情况下使用这个发送,或高速时同时使用这个和 _helper 并肩作战
# bus:                   CAN总线对象。
# arbitration_id:        29位仲裁ID。
# data:                  CAN数据字段，长度为0-8字节。
# block_receive:         是否阻塞接收 0否(不管接收) 1是(等待接收)
# rx_data:               接收数据数组
#================================================================
def send_extended_frame_main(bus, arbitration_id , data , block_receive):  

    state = 0
    rx_data = [0 for i in range(8)]  
    message = can.Message(arbitration_id=arbitration_id,data=data,is_extended_id=True)  

    # 发送CAN消息  
    bus.send(message)  

    if block_receive == 1:
        
        time_s=time.time()
        while (1):  
            message_ou = bus.recv(0.1)  
            if message_ou is not None:  
                rx_data = message_ou.data
                break

            elif time.time() - time_s >1:
                print("仲裁号: %d 未受到回馈-error" % arbitration_id)
                state = 1
                break


    return(state,rx_data) 


#**************************************************************************
#设置电机零角度功能函数
# bus:         总线端口号
# motorID :    电机ID
# state 0:     数据正常接收 1:通讯故障
#**************************************************************************
def set_motor_angle_zero(bus,motorID):
    global pai

    #仲裁帧ID
    #功能码0x0600 
    #主ID号0xfd
    #末尾两位从ID      
    arbitration_id = 0x0600fd00
    arbitration_id = arbitration_id + motorID
    data_s = [0 for i in range(8)] 
    data_s[0] = 0x01


    (state,rx_data) = send_extended_frame_main(bus, arbitration_id, data_s,1)

    if state == 0:
        print("设置电机ID号:%d 设置负载端零角度OK" % motorID)
    else:
        print("设置电机ID号:%d 设置负载端零角度error" % motorID)

    return state



#**************************************************************************
# 设置电机模式:   运控模式    
# bus:          总线端口号
# motorID :     电机ID
# state 0:      数据正常接收 1:通讯故障
# 数据位第[4]位   0：运控模式，1：位置模式，2：速度模式，3：电流模式
#**************************************************************************
def set_motion_mode(bus,motorID):  
    global pai

    #仲裁帧ID
    #功能码0x1200 
    #主ID号0xfd
    #末尾两位从ID      
    arbitration_id = 0x1200fd00
    arbitration_id = arbitration_id + motorID
    data_s = [0 for i in range(8)] 

    (state,rx_data) = send_extended_frame_main(bus, arbitration_id, data_s,1)

    if state == 0:
        print("设置电机ID号:%d 控制模式(运控模式)OK" % motorID)
    else:
        print("设置电机ID号:%d 控制模式(运控模式)error" % motorID)

    return state


#**************************************************************************
# 设置电机模式使能
# bus:         总线端口号
# motorID :    电机ID
# state 0:     数据正常接收 1:通讯故障
#**************************************************************************
def set_motion_enable(bus,motorID):  #motorID

    state = 0

    #仲裁帧ID
    #功能码0x1200 
    #主ID号0xfd
    #末尾两位从ID      
    arbitration_id = 0x0300fd00
    arbitration_id = arbitration_id + motorID
    data_s = [0 for i in range(8)] 

    (state,rx_data) = send_extended_frame_main(bus, arbitration_id, data_s,1)

    if state == 0:
        print("设置电机ID号:%d 电机模式使能OK" % motorID)
    else:
        print("设置电机ID号:%d 电机模式使能error" % motorID)

    return state


#**************************************************************************
# 左腿设置电机运控参数应用通道1，这个函数适用于左腿CAN通道机械臂正逆解后的的执行应用
# bus:      总线端口号
# motorID:  电机ID号 
# torque:   设定扭矩,                        0~~65535 对应 -12Nm~~12Nm
# radian:   设定角度(弧单位)                  0~~65535 对应 -4Π~~4Π
# speed:    设定速度                         0~~65535 对应 -30rad/s~~30rad/s
# KP:       设定角度-当前角度的 KP值           0~~65535 对应 0.0~~500.0
# KD:       设定速度-当前速度的 KD值           0~~65535 对应 0.0~~5.0

# read :    0不阻塞读取，1阻塞等待读取返回数据
# state 0:  数据正常接收 1:通讯故障
# rx_data:  从机回馈质量内容
#**************************************************************************
def leg_set_motion_parameter_L(bus,motorID,torque,radian,speed,KP,KD):

    global pai,P_MIN,P_MAX,T_MIN,T_MAX,V_MIN,V_MAX,KP_MIN,KP_MAX,KD_MIN,KD_MAX

    data_s = [0 for i in range(8)] 

   

    # 转化扭矩参数
    data_int16 = (float_to_uint16(torque,P_MIN,P_MAX))<<8 
    arbitration_id = 0x01000000 | data_int16 | motorID


    # 转化角度(弧度)参数载入
    data_int16 = (float_to_uint16(radian,T_MIN,T_MAX))
    data_s[0] = data_int16>>8
    data_s[1] = data_int16 & 0x00ff

    #转化载入速度参数
    data_int16 = (float_to_uint16(speed,V_MIN,V_MAX))
    data_s[2] = data_int16>>8
    data_s[3] = data_int16 & 0x00ff

    #转化载入KP参数
    data_int16 = (float_to_uint16(KP,KP_MIN,KP_MAX))
    data_s[4] = data_int16>>8
    data_s[5] = data_int16 & 0x00ff  

    #转化载入KD参数
    data_int16 = (float_to_uint16(KD,KD_MIN,KD_MAX))
    data_s[6] = data_int16>>8
    data_s[7] = data_int16 & 0x00ff 

    (state,rx_data)  = send_extended_frame_main(bus, arbitration_id, data_s,0)

    return state
 




#**************************************************************************
#有符号浮点型转四位十六进制(输出小端模式：低在左高在右) 适合单个参数写函数
#**************************************************************************
def float_to_P4hex(float_data):
    # 将十进制浮点数转换为十六进制浮点数
    byte_representation = struct.pack('f', float_data)
    return byte_representation


#**************************************************************************
# 四位十六进制转有符号浮点型转(输入小端模式：低在左高在右) 适合单个参数写函数
#**************************************************************************
def P4hex_to_float(P4hex_data):
    bytes_obj = P4hex_data.to_bytes(4, byteorder='big') 
    float_value = struct.unpack('f', bytes_obj)[0]

    return float_value


#**************************************************************************
# 有符号浮点型转十六进制(0~65536)无符号型      适合运控模式参赛转换
# float_data:        要转换的有符号浮点数据
# float_data_min：   下限范围
# float_data_max：   上限范围
# return :           输出0~65535的int型数据
#**************************************************************************
def float_to_uint16(float_data,float_data_min,float_data_max):

    if float_data > float_data_max:
        float_data_s = float_data_max
    elif float_data < float_data_min:
        float_data_s = float_data_min
    else:
        float_data_s = float_data
    
    return int((float_data_s - float_data_min)/(float_data_max - float_data_min) * 65535)


#**************************************************************************
# 十六进制(0~65535)无符号型转有符号浮点型  适合运控模式参赛转换
# uint16_data:       要转换的无符号型数据
# float_data_min：   下限范围
# float_data_max：   上限范围
# return :           输出上下限范围内的比例 有符合浮点型数据
#**************************************************************************
def uint16_to_float(uint16_data,float_data_min,float_data_max):
   return float((uint16_data - 32767)/65535) * (float_data_max - float_data_min)


############主函数############
############主函数############
def main():  

    # 创建CAN总线对象，参数需要根据实际情况配置  
    # channel: CAN接口名称，如'can0'或'can1'
    bus = can.interface.Bus(bustype='socketcan', channel='can0', bitrate=1000000)  



    # 假设以控制2个小米电机为例(ID号分别为 6、7)，ID号需要改为你自己电机的实际ID号
    motorID = 6                                 
    #------1：将某个电机机械角度归零
    set_motor_angle_zero(bus,motorID)
    #------2：再将某个电机设置为运控模式
    set_motion_mode(bus,motorID)
    #------3：再将某个电机设置为运控模式 使能
    set_motion_enable(bus,motorID)

    motorID2 = 7
    set_motor_angle_zero(bus,motorID2)
    set_motion_mode(bus,motorID2)
    set_motion_enable(bus,motorID2)



    #------------以下是控制电机来回旋转的案例-----------------------

    red = 0.0                  #最小角度也是起始角度必须为0
    fx = 0                     #方向标志位
    red_max = 1.2              #最大角度
    time_delay = 0.002         #速率延时
    while True:

        try:  

            if fx == 0 and red < red_max:
                red = red + 0.01
            elif fx == 0 and red >= red_max:
                fx = 1
                time.sleep(1) 
            elif fx == 1 and red > 0:
                red = red - 0.01
            elif fx == 1 and red <= 0:
                fx = 0
                time.sleep(1) 

            leg_set_motion_parameter_L(bus,motorID,0,red,0,10,0.5)
            leg_set_motion_parameter_L(bus,motorID2,0,red,0,10,0.5)
            time.sleep(time_delay) 


        # 当按下 Ctrl+C 时，会执行这里的代码结束跳出
        except KeyboardInterrupt:  
            print("按下 Ctrl+C,结束----")
            break


    # 在退出时确保资源被释放  
    bus.shutdown() 
    

  
if __name__ == "__main__":  
    main()

