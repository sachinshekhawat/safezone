package websocket

import (
	"log"
	"sync"

	"github.com/google/uuid"
)

// Hub maintains the set of active clients and broadcasts messages.
type Hub struct {
	// Registered clients grouped by SOS request ID
	clients map[uuid.UUID]map[*Client]bool

	// Register requests from clients
	Register chan *Client

	// Unregister requests from clients
	Unregister chan *Client

	mu sync.RWMutex
}

// NewHub creates a new Hub.
func NewHub() *Hub {
	return &Hub{
		clients:    make(map[uuid.UUID]map[*Client]bool),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
	}
}

// Run starts the hub's main loop.
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Register:
			h.mu.Lock()
			if h.clients[client.SOSID] == nil {
				h.clients[client.SOSID] = make(map[*Client]bool)
			}
			h.clients[client.SOSID][client] = true
			h.mu.Unlock()
			log.Printf("🔗 WebSocket client connected: SOS=%s role=%s", client.SOSID, client.Role)

		case client := <-h.Unregister:
			h.mu.Lock()
			if clients, ok := h.clients[client.SOSID]; ok {
				if _, exists := clients[client]; exists {
					delete(clients, client)
					close(client.Send)
					if len(clients) == 0 {
						delete(h.clients, client.SOSID)
					}
				}
			}
			h.mu.Unlock()
			log.Printf("🔌 WebSocket client disconnected: SOS=%s role=%s", client.SOSID, client.Role)
		}
	}
}

// BroadcastToSOS sends a message to all clients watching a specific SOS.
func (h *Hub) BroadcastToSOS(sosID uuid.UUID, message []byte) {
	h.mu.RLock()
	clients, ok := h.clients[sosID]
	h.mu.RUnlock()

	if !ok {
		return
	}

	for client := range clients {
		// Don't echo back to the sender (victim)
		if client.Role == "victim" {
			continue
		}
		select {
		case client.Send <- message:
		default:
			h.mu.Lock()
			delete(clients, client)
			close(client.Send)
			h.mu.Unlock()
		}
	}
}

// ActiveSOSCount returns the number of active SOS sessions.
func (h *Hub) ActiveSOSCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}
