package main

// Go 跨语言通用客户端 (Universal Go Client - Zero Build / Zero CGO)
// 0 个外部第三方依赖，不依赖 CGO，无需 gcc 编译器！

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"sync"
)

type MiniDBClient struct {
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	reader *bufio.Reader
	mu     sync.Mutex
	seqID  uint64
}

func OpenMiniDB(dbPath, binPath string) (*MiniDBClient, error) {
	cmd := exec.Command(binPath, dbPath, "stdio")
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}

	if err := cmd.Start(); err != nil {
		return nil, err
	}

	reader := bufio.NewReader(stdout)
	// 读取握手行
	_, _ = reader.ReadString('\n')

	return &MiniDBClient{
		cmd:    cmd,
		stdin:  stdin,
		reader: reader,
		seqID:  1,
	}, nil
}

func (c *MiniDBClient) Send(action string, params map[string]interface{}) (map[string]interface{}, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.seqID++
	req := map[string]interface{}{
		"id":     c.seqID,
		"action": action,
	}
	for k, v := range params {
		req[k] = v
	}

	bytes, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	if _, err := c.stdin.Write(append(bytes, '\n')); err != nil {
		return nil, err
	}

	line, err := c.reader.ReadString('\n')
	if err != nil {
		return nil, err
	}

	var resp map[string]interface{}
	if err := json.Unmarshal([]byte(line), &resp); err != nil {
		return nil, err
	}

	if errMsg, ok := resp["error"].(string); ok {
		return nil, fmt.Errorf("engine error: %s", errMsg)
	}

	return resp, nil
}

func (c *MiniDBClient) Close() error {
	_ = c.stdin.Close()
	return c.cmd.Process.Kill()
}

func main() {
	fmt.Println("MiniDB Go Universal Client (0 Dependencies / Zero CGO)")
}
